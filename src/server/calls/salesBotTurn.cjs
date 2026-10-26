"use strict";

const {
  buildSystemPrompt,
  loadSalesBotTrainingForPrompt,
  buildWelcomeGreeting,
  wrapPlainTextForTts,
  streamSalesOpenAiReply,
} = require("./salesBotCore.cjs");

const FALLBACK_SAY = "Sorry, I lost that for a second. Could you say that again?";
const MAX_MESSAGES = 24;

function trimMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  if (list.length <= MAX_MESSAGES) return list;
  return [list[0], ...list.slice(-(MAX_MESSAGES - 1))];
}

function serializeState(state) {
  return {
    messages: Array.isArray(state.messages)
      ? state.messages.map((m) => ({
          role: String(m?.role || ""),
          content: String(m?.content || ""),
        }))
      : [],
  };
}

function parseState(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    messages: Array.isArray(src.messages)
      ? src.messages
          .filter(
            (m) =>
              m &&
              ["system", "user", "assistant"].includes(String(m.role || "")) &&
              m.content != null,
          )
          .map((m) => ({
            role: String(m.role),
            content: String(m.content).slice(0, 8000),
          }))
      : [],
  };
}

async function startSalesBotTurn() {
  const training = await loadSalesBotTrainingForPrompt();
  const welcome = buildWelcomeGreeting(training.name);
  const state = {
    messages: [
      { role: "system", content: buildSystemPrompt(training) },
      { role: "assistant", content: welcome },
    ],
  };

  return {
    ok: true,
    reply: wrapPlainTextForTts(welcome),
    customerText: "",
    botName: String(training?.name || "").trim() || "Sales Assistant",
    state: serializeState(state),
  };
}

async function continueSalesBotTurn({ userText, state: rawState, signal }) {
  const user = String(userText || "").trim();
  if (!user) {
    return { ok: false, error: "Say something as the customer.", status: 400 };
  }

  let state = parseState(rawState);
  if (!state.messages.length) {
    const started = await startSalesBotTurn();
    if (!started.ok) return started;
    state = parseState(started.state);
  }

  state.messages.push({ role: "user", content: user });
  state.messages = trimMessages(state.messages);

  const training = await loadSalesBotTrainingForPrompt();
  let reply = "";
  try {
    reply = await streamSalesOpenAiReply({
      messages: state.messages,
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return { ok: false, aborted: true };
    console.error("[sales-bot] turn failed:", err?.message || err);
    reply = FALLBACK_SAY;
  }

  const spoken = wrapPlainTextForTts(reply || FALLBACK_SAY);
  state.messages.push({ role: "assistant", content: spoken });
  state.messages = trimMessages(state.messages);

  return {
    ok: true,
    reply: spoken,
    customerText: user,
    botName: String(training?.name || "").trim() || "Sales Assistant",
    state: serializeState(state),
  };
}

module.exports = {
  FALLBACK_SAY,
  startSalesBotTurn,
  continueSalesBotTurn,
};
