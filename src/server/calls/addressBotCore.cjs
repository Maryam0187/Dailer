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

function getTtsRate() {
  return String(process.env.ADDRESS_BOT_TTS_RATE || "70%").trim() || "70%";
}

function getOpenAiModel() {
  return String(process.env.OPENAI_ADDRESS_BOT_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";
}

function getOpenAiApiKey() {
  return String(process.env.OPENAI_API_KEY || "").trim();
}

function escapeXmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const ADDRESS_WORDS_NOT_SPELLED = new Set([
  "street",
  "st",
  "avenue",
  "ave",
  "road",
  "rd",
  "boulevard",
  "blvd",
  "drive",
  "dr",
  "lane",
  "ln",
  "way",
  "court",
  "ct",
  "circle",
  "cir",
  "place",
  "pl",
  "terrace",
  "ter",
  "highway",
  "hwy",
  "parkway",
  "pkwy",
  "suite",
  "ste",
  "apartment",
  "apt",
  "unit",
  "floor",
  "fl",
  "building",
  "bldg",
  "north",
  "south",
  "east",
  "west",
  "northeast",
  "northwest",
  "southeast",
  "southwest",
  "ne",
  "nw",
  "se",
  "sw",
  "po",
  "box",
  "and",
  "the",
  "of",
  "in",
  "at",
  "usa",
  "us",
]);

function shouldSpellWord(word) {
  const letters = String(word || "").replace(/[^A-Za-z]/g, "");
  if (letters.length < 2) return false;
  return !ADDRESS_WORDS_NOT_SPELLED.has(letters.toLowerCase());
}

function spellWordSsml(word) {
  const letters = String(word || "").replace(/[^A-Za-z]/g, "");
  if (!letters) return escapeXmlText(word);
  return `${escapeXmlText(word)}<break time="350ms"/> that's <say-as interpret-as="characters">${escapeXmlText(letters.toUpperCase())}</say-as>`;
}

function tokenToSsml(token) {
  const raw = String(token || "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) {
    return `<say-as interpret-as="digits">${escapeXmlText(raw)}</say-as>`;
  }
  const mixed = raw.match(/^(\d+)([A-Za-z].*)$/);
  if (mixed) {
    return `${tokenToSsml(mixed[1])} ${tokenToSsml(mixed[2])}`;
  }
  if (shouldSpellWord(raw)) return spellWordSsml(raw);
  return escapeXmlText(raw);
}

function addressToSsml(address) {
  const parts = String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks = parts.length ? parts : [String(address || "").trim()];
  return chunks
    .map((part) => {
      const tokens = part.split(/[\s/]+/).filter(Boolean);
      const spoken = tokens.map(tokenToSsml).join('<break time="280ms"/> ');
      return `${spoken}<break time="800ms"/>`;
    })
    .join(" ");
}

function wrapSlowSsml(innerSsml) {
  const rate = escapeXmlAttr(getTtsRate());
  return `<speak><prosody rate="${rate}">${innerSsml}</prosody></speak>`;
}

function wrapPlainTextForTts(text) {
  const spoken = String(text || "").trim();
  if (!spoken) return "";
  return wrapSlowSsml(escapeXmlText(spoken));
}

const READY_CHECK =
  "Do you have a pen and paper ready? Please say yes when you are ready for me to say the address.";
const READY_WAIT =
  "No problem. Take your time. Say yes when you are ready to write down the address.";
const READY_RETRY =
  "Just say yes when you have a pen and paper, and I will say the address slowly.";

function buildWelcomeGreeting() {
  return READY_CHECK;
}

function buildWelcomeGreetingSsml() {
  return wrapSlowSsml(
    [
      "Do you have a pen and paper ready?",
      '<break time="700ms"/>',
      "Please say yes when you are ready for me to say the address.",
    ].join(" "),
  );
}

function buildAddressReadSsml(address) {
  const spoken = addressToSsml(address);
  return wrapSlowSsml(
    [
      "Okay. I will say the address slowly, and I will spell the names.",
      '<break time="700ms"/>',
      spoken,
      '<break time="1s"/>',
      "I will repeat that.",
      '<break time="700ms"/>',
      spoken,
      '<break time="800ms"/>',
      "If you need that repeated or spelled again, just ask. Your representative is still on the line.",
    ].join(" "),
  );
}

function classifyReadyReply(text) {
  const t = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "unknown";
  const saysWait = /\b(not yet|not ready|hold on|hold up|wait|one second|one sec|hang on|give me a (minute|second)|no)\b/.test(
    t,
  );
  const saysReady = /\b(yes|yeah|yep|yup|ready|go ahead|okay|ok|sure|i am ready|i'm ready|go)\b/.test(t);
  if (saysWait && !saysReady) return "wait";
  if (saysReady) return "ready";
  return "unknown";
}

function buildSystemPrompt(address) {
  const spoken = String(address || "").trim();
  return [
    "You are a voice assistant on a live phone call. A human agent is also on the line and can take over at any time.",
    "Your only job is to help the customer write down this company address:",
    spoken,
    "Do not say the address until the customer has confirmed they are ready (yes, ready, okay, go ahead).",
    "If they are not ready, wait. Once they are ready, say the address slowly, pause between street, city, state, and ZIP, and say numbers digit by digit. Then repeat it once.",
    "When you say a name or street name, first say the word, then spell it letter by letter. Example: Main, that's M A I N. Do not spell common words like Street, Avenue, Road, Drive, Suite, or North.",
    "After that, you may repeat it, say it slower, spell words, or break it into parts if they ask.",
    "Answer only questions about this address. If they ask about anything else, including a different location, say their representative is on the line and can help.",
    "Do not invent other company facts or other addresses.",
    "Keep replies short spoken sentences. No markdown, lists, SSML, or special characters.",
  ].join(" ");
}

function signRelayToken({ addressId, callId }) {
  const secret = String(process.env.JWT_SECRET || "");
  const ts = Date.now();
  const body = `${Number(addressId) || 0}.${Number(callId)}.${ts}`;
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
  const body = `${Number(addressId) || 0}.${Number(callId)}.${ts}`;
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
  const greeting = String(welcomeGreeting || "").trim();
  const greetingAttr = greeting ? `\n      welcomeGreeting="${escapeXmlAttr(greeting)}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${escapeXmlAttr(relayUrl)}"${greetingAttr}
      welcomeGreetingInterruptible="speech"
      interruptible="true"
      ignoreBackchannel="true"
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
  getTtsRate,
  getOpenAiModel,
  getOpenAiApiKey,
  buildWelcomeGreeting,
  buildWelcomeGreetingSsml,
  buildAddressReadSsml,
  classifyReadyReply,
  READY_WAIT,
  READY_RETRY,
  wrapPlainTextForTts,
  buildSystemPrompt,
  signRelayToken,
  verifyRelayToken,
  httpsToWss,
  buildRelayUrl,
  buildConversationRelayTwiml,
  streamOpenAiReply,
};
