"use strict";

const crypto = require("crypto");

const ADDRESS_BOT_LABEL = "address-bot";
const LABEL_MAX = 64;
const ADDRESS_MAX = 1000;
const RELAY_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

function escapeXmlAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function trimField(value, maxLen) {
  if (value == null) return "";
  return String(value).trim().slice(0, maxLen);
}

function parseCompanyAddressBody(body, { requireAll = true } = {}) {
  const src = body && typeof body === "object" ? body : {};
  const errors = [];
  const data = {};

  if (src.label !== undefined || requireAll) {
    const label = trimField(src.label, LABEL_MAX);
    if (!label) errors.push("Label is required");
    else data.label = label;
  }

  if (src.address !== undefined || requireAll) {
    const address = trimField(src.address, ADDRESS_MAX);
    if (!address) errors.push("Address is required");
    else data.address = address;
  }

  if (src.sortOrder !== undefined) {
    const n = Number(src.sortOrder);
    if (!Number.isInteger(n) || n < 0) errors.push("sortOrder must be a non-negative integer");
    else data.sortOrder = n;
  }

  return { data, errors };
}

function serializeCompanyAddress(row, { includeAddress = false } = {}) {
  if (!row) return null;
  const out = {
    id: row.id,
    label: row.label,
    sortOrder: row.sortOrder,
  };
  if (includeAddress) {
    out.address = row.address;
    out.updatedBy = row.updatedBy ?? null;
    out.updatedAt = row.updatedAt || null;
    out.createdAt = row.createdAt || null;
  }
  return out;
}

function getAddressBotVoice() {
  return String(process.env.ADDRESS_BOT_VOICE || "Joanna-Neural").trim() || "Joanna-Neural";
}

function getOpenAiModel() {
  return String(process.env.OPENAI_ADDRESS_BOT_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";
}

function getOpenAiApiKey() {
  return String(process.env.OPENAI_API_KEY || "").trim();
}

function buildWelcomeGreeting(address) {
  const spoken = String(address || "").trim();
  return [
    "Please get a pen and paper. I will say the address slowly.",
    spoken,
    "I will repeat that.",
    spoken,
    "If you need that repeated or spelled, just ask. Your representative is still on the line.",
  ].join(" ");
}

function buildSystemPrompt(address) {
  const spoken = String(address || "").trim();
  return [
    "You are a voice assistant on a live phone call. A human agent is also on the line and can take over at any time.",
    "Your only job is to help the customer write down this company address:",
    spoken,
    "You may repeat it, say it slower, spell words, or break it into street, city, state, and ZIP.",
    "Answer only questions about this address. If they ask about anything else, including a different location, say their representative is on the line and can help.",
    "Do not invent other company facts or other addresses.",
    "Keep replies short spoken sentences. No markdown, lists, or special characters.",
  ].join(" ");
}

function signRelayToken({ addressId, callId }) {
  const secret = String(process.env.JWT_SECRET || "");
  const ts = Date.now();
  const body = `${Number(addressId)}.${Number(callId)}.${ts}`;
  const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `${ts}.${sig}`;
}

function verifyRelayToken({ addressId, callId, token }) {
  const secret = String(process.env.JWT_SECRET || "");
  const raw = String(token || "");
  const dot = raw.indexOf(".");
  if (dot <= 0) return false;
  const ts = Number(raw.slice(0, dot));
  const sig = raw.slice(dot + 1);
  if (!Number.isFinite(ts) || !sig) return false;
  if (Date.now() - ts > RELAY_TOKEN_TTL_MS) return false;
  const body = `${Number(addressId)}.${Number(callId)}.${ts}`;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function httpsToWss(origin) {
  const base = String(origin || "").replace(/\/$/, "");
  if (!base) return "";
  if (base.startsWith("https://")) return `wss://${base.slice("https://".length)}`;
  if (base.startsWith("http://")) return `ws://${base.slice("http://".length)}`;
  if (base.startsWith("wss://") || base.startsWith("ws://")) return base;
  return `wss://${base}`;
}

function buildRelayUrl(origin, { addressId, callId, token }) {
  const qs = new URLSearchParams({
    addressId: String(addressId),
    callId: String(callId),
    token: String(token || ""),
  });
  return `${httpsToWss(origin)}/address-bot/relay?${qs.toString()}`;
}

function buildConversationRelayTwiml({ relayUrl, welcomeGreeting, voice }) {
  const ttsVoice = escapeXmlAttr(voice || getAddressBotVoice());
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${escapeXmlAttr(relayUrl)}"
      welcomeGreeting="${escapeXmlAttr(welcomeGreeting)}"
      welcomeGreetingInterruptible="true"
      interruptible="true"
      ttsProvider="Amazon"
      voice="${ttsVoice}"
      language="en-US"
    />
  </Connect>
</Response>`;
}

async function streamOpenAiReply({ messages, onToken, signal }) {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAiModel(),
      stream: true,
      temperature: 0.3,
      max_tokens: 250,
      messages,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `OpenAI request failed (${res.status})`);
  }

  if (!res.body) throw new Error("OpenAI response had no body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const piece = parsed?.choices?.[0]?.delta?.content;
      if (!piece) continue;
      full += piece;
      if (onToken) await onToken(piece);
    }
  }

  return full.trim();
}

module.exports = {
  ADDRESS_BOT_LABEL,
  LABEL_MAX,
  ADDRESS_MAX,
  escapeXmlAttr,
  parseCompanyAddressBody,
  serializeCompanyAddress,
  getAddressBotVoice,
  getOpenAiModel,
  getOpenAiApiKey,
  buildWelcomeGreeting,
  buildSystemPrompt,
  signRelayToken,
  verifyRelayToken,
  httpsToWss,
  buildRelayUrl,
  buildConversationRelayTwiml,
  streamOpenAiReply,
};
