"use strict";

const { parse } = require("url");
const { WebSocketServer } = require("ws");
const {
  verifyRelayToken,
  wrapPlainTextForTts,
} = require("./addressBotCore.cjs");
const { startAddressBotTurn, continueAddressBotTurn } = require("./addressBotTurn.cjs");
const {
  registerAddressBotSession,
  unregisterAddressBotSession,
} = require("./addressBotSessions.cjs");

const PATH = "/address-bot/relay";

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

function applyTurnState(session, result) {
  if (!result?.state) return;
  session.addressId = result.state.addressId;
  session.ready = result.state.ready;
  session.saidWait = result.state.saidWait;
  session.messages = result.state.messages;
  if (result.address) session.row = { address: result.address };
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
      saidWait: false,
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
      session.saidWait = false;
      session.messages = [];
      session.row = null;
      const started = await startAddressBotTurn({ addressId: id });
      if (!started.ok) {
        session.speaking = false;
        return { ok: false, error: started.error || "Address not found" };
      }
      applyTurnState(session, started);
      if (!session.closed && started.reply) {
        sendTextTokens(ws, wrapPlainTextForTts(started.reply));
      }
      return { ok: true };
    };

    async function replyToPrompt(voicePrompt) {
      if (!session.speaking) return;
      const userText = String(voicePrompt || "").trim();
      if (!userText) return;

      abortInflight();
      session.abort = new AbortController();

      const result = await continueAddressBotTurn({
        userText,
        state: {
          addressId: session.addressId,
          ready: session.ready,
          saidWait: session.saidWait,
          messages: session.messages,
        },
        addressId: session.addressId,
        signal: session.abort.signal,
      });

      if (result?.aborted || session.closed) return;
      if (!result?.ok) return;
      applyTurnState(session, result);
      if (result.reply) sendTextTokens(ws, wrapPlainTextForTts(result.reply));
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
