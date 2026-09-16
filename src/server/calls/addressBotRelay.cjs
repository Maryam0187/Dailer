"use strict";

const { parse } = require("url");
const { WebSocketServer } = require("ws");
const db = require("../../../models");
const {
  buildSystemPrompt,
  buildWelcomeGreeting,
  buildWelcomeGreetingSsml,
  buildAddressReadSsml,
  classifyReadyReply,
  READY_WAIT,
  READY_RETRY,
  streamOpenAiReply,
  verifyRelayToken,
  wrapPlainTextForTts,
} = require("./addressBotCore.cjs");
const {
  registerAddressBotSession,
  unregisterAddressBotSession,
} = require("./addressBotSessions.cjs");

const PATH = "/address-bot/relay";
const FALLBACK_SAY =
  "I'll say the address one more time, then leave you with your representative.";

function sendJson(ws, payload) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(payload));
}

function sendTextTokens(ws, text, { last = true } = {}) {
  const spoken = String(text || "").trim();
  if (!spoken) {
    sendJson(ws, { type: "text", token: "", last: true });
    return;
  }
  sendJson(ws, { type: "text", token: spoken, last: Boolean(last) });
  if (!last) sendJson(ws, { type: "text", token: "", last: true });
}

function readQuery(req) {
  const { query } = parse(req.url || "", true);
  return {
    addressId: Number(query.addressId),
    callId: Number(query.callId),
    token: String(query.token || ""),
  };
}

async function loadAddress(addressId) {
  if (!Number.isInteger(addressId) || addressId <= 0) return null;
  return db.CompanyAddress.findByPk(addressId, {
    attributes: ["id", "label", "address"],
  });
}

function attachAddressBotRelay(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url || "", true);
    if (pathname !== PATH) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req) => {
    const q = readQuery(req);
    if (
      !Number.isInteger(q.callId) ||
      q.callId <= 0 ||
      !Number.isInteger(q.addressId) ||
      q.addressId < 0 ||
      !verifyRelayToken({ addressId: q.addressId, callId: q.callId, token: q.token })
    ) {
      sendJson(ws, { type: "end" });
      ws.close();
      return;
    }

    const session = {
      addressId: q.addressId,
      callId: q.callId,
      messages: [],
      abort: null,
      closed: false,
      ready: false,
      speaking: false,
      row: null,
    };

    function abortInflight() {
      if (!session.abort) return;
      try {
        session.abort.abort();
      } catch {
        /* ignore */
      }
      session.abort = null;
    }

    async function ensurePrompt() {
      if (session.messages.length) return session.row;
      const row = await loadAddress(session.addressId);
      session.row = row;
      if (!row) return null;
      const welcome = buildWelcomeGreeting();
      session.messages = [
        { role: "system", content: buildSystemPrompt(row.address) },
        { role: "assistant", content: welcome },
      ];
      return row;
    }

    function speakReadyCheck() {
      sendTextTokens(ws, buildWelcomeGreetingSsml());
    }

    function speakAddress(address) {
      const spoken = String(address || "").trim();
      sendTextTokens(ws, buildAddressReadSsml(spoken));
      session.messages.push({
        role: "assistant",
        content: `Okay. I will say the address slowly. ${spoken} I will repeat that. ${spoken} If you need that repeated or spelled, just ask.`,
      });
    }

    session.beginSpeaking = async (addressId) => {
      if (session.closed) {
        return { ok: false, error: "Address bot disconnected. Click Ready bot again." };
      }
      const id = Number(addressId);
      if (!Number.isInteger(id) || id <= 0) {
        return { ok: false, error: "addressId must be a positive integer" };
      }
      abortInflight();
      session.addressId = id;
      session.ready = false;
      session.speaking = true;
      session.messages = [];
      session.row = null;
      const row = await ensurePrompt();
      if (!row) {
        session.speaking = false;
        return { ok: false, error: "Address not found" };
      }
      if (!session.closed) speakReadyCheck();
      return { ok: true };
    };

    async function replyToPrompt(voicePrompt) {
      if (!session.speaking) return;
      const row = await ensurePrompt();
      const spokenAddress = String(row?.address || "").trim();
      const userText = String(voicePrompt || "").trim();
      if (!userText) return;

      abortInflight();
      session.abort = new AbortController();

      if (!row || !spokenAddress) {
        sendTextTokens(ws, wrapPlainTextForTts("Your representative is on the line and can help with that."));
        return;
      }

      if (!session.ready) {
        const verdict = classifyReadyReply(userText);
        session.messages.push({ role: "user", content: userText });
        if (verdict === "ready") {
          session.ready = true;
          speakAddress(spokenAddress);
          return;
        }
        if (verdict === "wait") {
          sendTextTokens(ws, wrapPlainTextForTts(READY_WAIT));
          session.messages.push({ role: "assistant", content: READY_WAIT });
          return;
        }
        sendTextTokens(ws, wrapPlainTextForTts(READY_RETRY));
        session.messages.push({ role: "assistant", content: READY_RETRY });
        return;
      }

      session.messages.push({ role: "user", content: userText });
      if (session.messages.length > 24) {
        session.messages = [session.messages[0], ...session.messages.slice(-23)];
      }

      let full = "";
      try {
        full = await streamOpenAiReply({
          messages: session.messages,
          signal: session.abort.signal,
        });
        if (!session.closed) sendTextTokens(ws, wrapPlainTextForTts(full) || wrapPlainTextForTts(FALLBACK_SAY));
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error("[address-bot] openai failed:", err?.message || err);
        const fallback = `${FALLBACK_SAY} ${spokenAddress}`;
        sendTextTokens(ws, wrapPlainTextForTts(fallback));
        full = fallback;
      }

      if (full) session.messages.push({ role: "assistant", content: full });
    }

    registerAddressBotSession(session.callId, session);

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      const type = String(msg?.type || "").toLowerCase();
      if (type === "setup") {
        return;
      }
      if (type === "prompt") {
        const text = msg.voicePrompt || msg.prompt || msg.transcript || "";
        void replyToPrompt(text);
        return;
      }
      if (type === "interrupt") {
        abortInflight();
      }
    });

    ws.on("close", () => {
      session.closed = true;
      session.speaking = false;
      abortInflight();
      unregisterAddressBotSession(session.callId, session);
    });

    ws.on("error", (err) => {
      console.error("[address-bot] relay error:", err?.message || err);
    });
  });
}

module.exports = { attachAddressBotRelay, ADDRESS_BOT_RELAY_PATH: PATH };
