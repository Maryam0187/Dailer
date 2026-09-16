"use strict";

const { parse } = require("url");
const { WebSocketServer } = require("ws");
const db = require("../../../models");
const {
  buildSystemPrompt,
  buildWelcomeGreeting,
  streamOpenAiReply,
  verifyRelayToken,
} = require("./addressBotCore.cjs");

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
      !Number.isInteger(q.addressId) ||
      q.addressId <= 0 ||
      !Number.isInteger(q.callId) ||
      q.callId <= 0 ||
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
    };

    async function ensurePrompt() {
      if (session.messages.length) return session.row;
      const row = await loadAddress(session.addressId);
      session.row = row;
      if (!row) return null;
      const welcome = buildWelcomeGreeting(row.address);
      session.messages = [
        { role: "system", content: buildSystemPrompt(row.address) },
        { role: "assistant", content: welcome },
      ];
      return row;
    }

    async function replyToPrompt(voicePrompt) {
      const row = await ensurePrompt();
      const spokenAddress = String(row?.address || "").trim();
      const userText = String(voicePrompt || "").trim();
      if (!userText) return;

      if (session.abort) {
        try {
          session.abort.abort();
        } catch {
          /* ignore */
        }
      }
      session.abort = new AbortController();

      if (!row || !spokenAddress) {
        sendTextTokens(ws, "Your representative is on the line and can help with that.");
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
          onToken: async (piece) => {
            if (session.closed) return;
            sendJson(ws, { type: "text", token: piece, last: false });
          },
        });
        if (!session.closed) sendJson(ws, { type: "text", token: "", last: true });
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error("[address-bot] openai failed:", err?.message || err);
        const fallback = `${FALLBACK_SAY} ${spokenAddress}`;
        sendTextTokens(ws, fallback);
        full = fallback;
      }

      if (full) session.messages.push({ role: "assistant", content: full });
    }

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      const type = String(msg?.type || "").toLowerCase();
      if (type === "setup") {
        void ensurePrompt();
        return;
      }
      if (type === "prompt") {
      const text = msg.voicePrompt || msg.prompt || msg.transcript || "";
        void replyToPrompt(text);
        return;
      }
      if (type === "interrupt") {
        if (session.abort) {
          try {
            session.abort.abort();
          } catch {
            /* ignore */
          }
        }
      }
    });

    ws.on("close", () => {
      session.closed = true;
      if (session.abort) {
        try {
          session.abort.abort();
        } catch {
          /* ignore */
        }
      }
    });

    ws.on("error", (err) => {
      console.error("[address-bot] relay error:", err?.message || err);
    });
  });
}

module.exports = { attachAddressBotRelay, ADDRESS_BOT_RELAY_PATH: PATH };
