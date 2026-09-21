"use strict";

const db = require("../../../models");
const {
  buildSystemPrompt,
  loadAddressBotTrainingForPrompt,
  buildWelcomeGreeting,
  buildWelcomeGreetingSsml,
  buildAddressReadSsml,
  classifyReadyReply,
  READY_WAIT,
  READY_RETRY,
  streamOpenAiReply,
  wrapPlainTextForTts,
} = require("./addressBotCore.cjs");

const FALLBACK_SAY =
  "I'll say the address one more time, then leave you with your representative.";
const NO_ADDRESS_SAY = "Your representative is on the line and can help with that.";
const MAX_MESSAGES = 24;

async function loadAddress(addressId) {
  const id = Number(addressId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.CompanyAddress.findByPk(id, {
    attributes: ["id", "label", "address"],
  });
}

function trimMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  if (list.length <= MAX_MESSAGES) return list;
  return [list[0], ...list.slice(-(MAX_MESSAGES - 1))];
}

function serializeState(state) {
  return {
    addressId: Number(state.addressId) || 0,
    ready: Boolean(state.ready),
    saidWait: Boolean(state.saidWait),
    messages: Array.isArray(state.messages)
      ? state.messages.map((m) => ({
          role: String(m?.role || ""),
          content: String(m?.content || ""),
        }))
      : [],
  };
}

function parseState(raw, addressId) {
  const src = raw && typeof raw === "object" ? raw : {};
  const id = Number(addressId || src.addressId);
  return {
    addressId: Number.isInteger(id) && id > 0 ? id : 0,
    ready: Boolean(src.ready),
    saidWait: Boolean(src.saidWait),
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

function addressReadMessage(address) {
  const spoken = String(address || "").trim();
  return `Okay. I will say the address slowly. ${spoken} I will repeat that. ${spoken} If you need that repeated or spelled, just ask.`;
}

async function startAddressBotTurn({ addressId }) {
  const row = await loadAddress(addressId);
  if (!row) return { ok: false, error: "Address not found", status: 404 };

  const welcome = buildWelcomeGreeting();
  const training = await loadAddressBotTrainingForPrompt();
  const state = {
    addressId: row.id,
    ready: false,
    saidWait: false,
    messages: [
      { role: "system", content: buildSystemPrompt(row.address, training) },
      { role: "assistant", content: welcome },
    ],
  };

  return {
    ok: true,
    reply: wrapPlainTextForTts(buildWelcomeGreetingSsml()) || welcome,
    customerText: "",
    botName: String(training?.name || "").trim() || "Address Assistant",
    addressLabel: row.label,
    address: row.address,
    state: serializeState(state),
  };
}

async function continueAddressBotTurn({ userText, state: rawState, addressId, signal }) {
  const user = String(userText || "").trim();
  if (!user) {
    return { ok: false, error: "Say something as the customer.", status: 400 };
  }

  const state = parseState(rawState, addressId);
  const row = await loadAddress(state.addressId);
  const spokenAddress = String(row?.address || "").trim();

  if (!row || !spokenAddress) {
    return {
      ok: true,
      reply: wrapPlainTextForTts(NO_ADDRESS_SAY),
      customerText: user,
      botName: "Address Assistant",
      addressLabel: "",
      address: "",
      state: serializeState(state),
    };
  }

  if (!state.messages.length) {
    const started = await startAddressBotTurn({ addressId: row.id });
    if (!started.ok) return started;
    return continueAddressBotTurn({
      userText: user,
      state: started.state,
      addressId: row.id,
      signal,
    });
  }

  if (!state.ready) {
    const verdict = classifyReadyReply(user);
    state.messages.push({ role: "user", content: user });
    if (verdict === "ready") {
      state.ready = true;
      const reply = wrapPlainTextForTts(buildAddressReadSsml(spokenAddress));
      state.messages.push({ role: "assistant", content: addressReadMessage(spokenAddress) });
      return {
        ok: true,
        reply,
        customerText: user,
        address: spokenAddress,
        addressLabel: row.label,
        state: serializeState(state),
      };
    }
    if (verdict === "wait") {
      if (!state.saidWait) {
        state.saidWait = true;
        state.messages.push({ role: "assistant", content: READY_WAIT });
        return {
          ok: true,
          reply: wrapPlainTextForTts(READY_WAIT),
          customerText: user,
          address: spokenAddress,
          addressLabel: row.label,
          state: serializeState(state),
        };
      }
      return {
        ok: true,
        reply: "",
        customerText: user,
        address: spokenAddress,
        addressLabel: row.label,
        state: serializeState(state),
      };
    }
    state.messages.push({ role: "assistant", content: READY_RETRY });
    return {
      ok: true,
      reply: wrapPlainTextForTts(READY_RETRY),
      customerText: user,
      address: spokenAddress,
      addressLabel: row.label,
      state: serializeState(state),
    };
  }

  state.messages.push({ role: "user", content: user });
  state.messages = trimMessages(state.messages);

  let full = "";
  try {
    full = await streamOpenAiReply({
      messages: state.messages,
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      return { ok: false, aborted: true, error: "Aborted", status: 499 };
    }
    console.error("[address-bot] openai failed:", err?.message || err);
    full = `${FALLBACK_SAY} ${spokenAddress}`;
  }

  const reply = wrapPlainTextForTts(full) || wrapPlainTextForTts(FALLBACK_SAY);
  if (reply) state.messages.push({ role: "assistant", content: reply });

  return {
    ok: true,
    reply,
    customerText: user,
    address: spokenAddress,
    addressLabel: row.label,
    state: serializeState(state),
  };
}

module.exports = {
  FALLBACK_SAY,
  startAddressBotTurn,
  continueAddressBotTurn,
};
