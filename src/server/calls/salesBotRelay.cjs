"use strict";

const { parse } = require("url");
const { WebSocketServer } = require("ws");
const { verifyRelayToken, wrapPlainTextForTts } = require("./salesBotCore.cjs");
const { startSalesBotTurn, continueSalesBotTurn } = require("./salesBotTurn.cjs");
const {
  registerSalesBotSession,
  unregisterSalesBotSession,
} = require("./salesBotSessions.cjs");

const PATH = "/sales-bot/relay";

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
    callId: Number(query.callId),
    token: String(query.token || ""),
  };
}

function applyTurnState(session, result) {
  if (!result?.state) return;
  session.messages = result.state.messages;
}

function attachSalesBotRelay(server) {
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
      !verifyRelayToken({ callId: q.callId, token: q.token })
    ) {
      sendJson(ws, { type: "end" });
      ws.close();
      return;
    }

    const session = {
      callId: q.callId,
      messages: [],
      abort: null,
      closed: false,
      speaking: false,
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

    session.beginSpeaking = async () => {
      if (session.closed) {
        return { ok: false, error: "Sales bot disconnected." };
      }
      abortInflight();
      session.speaking = true;
      session.messages = [];
      const started = await startSalesBotTurn();
      if (!started.ok) {
        session.speaking = false;
        return { ok: false, error: started.error || "Failed to start sales bot" };
      }
      applyTurnState(session, started);

      // 1) Please-hold connect line, then 2) sales pitch.
      if (!session.closed && started.holdMessage) {
        sendTextTokens(ws, wrapPlainTextForTts(started.holdMessage));
        await new Promise((resolve) => setTimeout(resolve, 2800));
      }
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

      const result = await continueSalesBotTurn({
        userText,
        state: { messages: session.messages },
        signal: session.abort.signal,
      });

      if (result?.aborted || session.closed) return;
      if (!result?.ok) return;
      applyTurnState(session, result);
      if (result.reply) sendTextTokens(ws, wrapPlainTextForTts(result.reply));
    }

    registerSalesBotSession(session.callId, session);

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      const type = String(msg?.type || "").toLowerCase();
      if (type === "setup") {
        // Ready silently; start route calls beginSpeaking when the customer answers.
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
      unregisterSalesBotSession(session.callId, session);
    });

    ws.on("error", (err) => {
      console.error("[sales-bot] relay error:", err?.message || err);
    });
  });
}

module.exports = { attachSalesBotRelay, SALES_BOT_RELAY_PATH: PATH };
