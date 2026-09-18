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

function getTtsProvider() {
  const raw = String(process.env.ADDRESS_BOT_TTS_PROVIDER || "Amazon").trim().toLowerCase();
  if (raw === "elevenlabs") return "ElevenLabs";
  if (raw === "google") return "Google";
  return "Amazon";
}

function getAddressBotVoice() {
  const env = String(process.env.ADDRESS_BOT_VOICE || "").trim();
  const provider = getTtsProvider();
  if (provider === "Google") {
    return env || "en-US-Journey-O";
  }
  if (provider === "ElevenLabs") {
    if (env && !/neural|joanna|polly|amazon/i.test(env)) return env;
    return "21m00Tcm4TlvDq8ikWAM";
  }
  return env || "Joanna-Neural";
}

function getTtsRate() {
  return String(process.env.ADDRESS_BOT_TTS_RATE || "80%").trim() || "80%";
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

function spellLetters(word) {
  return String(word || "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .split("")
    .join(", ");
}

function digitsSpoken(value) {
  const names = {
    0: "zero",
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
    9: "nine",
  };
  return String(value || "")
    .replace(/\D/g, "")
    .split("")
    .map((d) => names[d] || d)
    .join(", ");
}

function tokenToSpoken(token) {
  const raw = String(token || "").trim();
  if (!raw) return "";
  const pieces = raw.split(/(\d+)/).filter(Boolean);
  return pieces
    .map((piece) => {
      if (/^\d+$/.test(piece)) return digitsSpoken(piece);
      const cleaned = piece.replace(/^[\s.,#\-_/]+|[\s.,#\-_/]+$/g, "");
      if (!cleaned) return "";
      if (shouldSpellWord(cleaned)) {
        return `${cleaned}. I will spell that: ${spellLetters(cleaned)}.`;
      }
      return cleaned;
    })
    .filter(Boolean)
    .join(" ");
}

function addressToSpokenText(address) {
  const parts = String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks = parts.length ? parts : [String(address || "").trim()];
  return chunks
    .map((part, index) => {
      const tokens = part.split(/[\s/]+/).filter(Boolean);
      const spoken = tokens.map(tokenToSpoken).join(" ");
      if (index === 0) return spoken;
      return `Next. ${spoken}`;
    })
    .join(" ");
}

function addressToSsml(address) {
  const spoken = escapeXmlText(addressToSpokenText(address)).replace(/\.\.\./g, '.<break time="450ms"/>');
  return `${spoken}<break time="700ms"/>`;
}

function wrapSlowSsml(innerSsml) {
  const rate = escapeXmlAttr(getTtsRate());
  return `<speak><prosody rate="${rate}" pitch="-8%">${innerSsml}</prosody></speak>`;
}

function formatForTts(text) {
  const spoken = String(text || "")
    .replace(/\.\.\./g, ".")
    .replace(/\s+/g, " ")
    .trim();
  if (!spoken) return "";
  if (getTtsProvider() === "Amazon") {
    const withPauses = escapeXmlText(spoken).replace(/\. /g, '.<break time="350ms"/> ');
    return wrapSlowSsml(withPauses);
  }
  return spoken;
}

function wrapPlainTextForTts(text) {
  return formatForTts(text);
}

const READY_CHECK =
  "Hi, I'm the address assistant. I'll give you an address to write down. Please grab a pen and paper, and say yes when you're ready.";
const READY_WAIT =
  "No rush at all. I'll wait. When you're back, just say yes and I'll start.";
const READY_RETRY = "Whenever you've got a pen and paper, just say yes and I'll start.";

function buildWelcomeGreeting() {
  return READY_CHECK;
}

function buildWelcomeGreetingSsml() {
  return formatForTts(READY_CHECK);
}

function buildAddressReadSsml(address) {
  const spoken = addressToSpokenText(address);
  return formatForTts(
    [
      "Okay, great. I'll go slowly. I'll say numbers digit by digit, and I'll spell the names so it's easy to write down.",
      spoken,
      "Let me say that one more time.",
      spoken,
      "If you need me to repeat anything, just say so. Your representative is still right here with you.",
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
  const saysWait = /\b(not yet|not ready|hold on|hold up|on hold|hold please|hold|wait|one second|one sec|one minute|hang on|give me a (minute|second)|let me get|grab a pen|get a pen|pen and paper|pencil|no)\b/.test(
    t,
  );
  const saysReady = /\b(yes|yeah|yep|yup|ready|go ahead|okay|ok|sure|i am ready|i'm ready|go|back)\b/.test(t);
  if (saysWait && !saysReady) return "wait";
  if (saysReady) return "ready";
  return "unknown";
}

function buildSystemPrompt(address) {
  const spoken = String(address || "").trim();
  return [
    "You are a warm, natural person on a live phone call helping a customer write down an address. A human agent is also on the line.",
    "Sound like a real colleague, not a robot. Use contractions. Speak slowly, clearly, and in an even speaking voice. Do not sing or use a singsong tone.",
    "This is the only address you may give:",
    spoken,
    "Do not say the address until the customer has confirmed they are ready (yes, ready, okay, go ahead).",
    "If they are not ready, wait kindly. Once they are ready, say the address slowly. Pause between street, city, state, and ZIP. Then repeat it once.",
    "Say every number digit by digit as words, never as a whole number. Example: 123 is one ... two ... three. 75201 is seven ... five ... two ... zero ... one. Never say one hundred twenty-three or seventy-five thousand.",
    "When you say a name or street name, first say the word, then spell it. Example: Main... I'll spell that: M, A, I, N. Do not spell common words like Street, Avenue, Road, Drive, Suite, or North.",
    "After that, you may repeat it, go slower, or spell again if they ask.",
    "Answer only questions about this address. If they ask about anything else, say their representative is right there and can help.",
    "Do not invent other company facts or other addresses.",
    "Keep replies to a few spoken sentences. No markdown, lists, SSML, or special characters.",
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
  const provider = getTtsProvider();
  const ttsVoice = escapeXmlAttr(voice || getAddressBotVoice());
  const greeting = String(welcomeGreeting || "").trim();
  const greetingAttr = greeting ? `\n      welcomeGreeting="${escapeXmlAttr(greeting)}"` : "";
  const elevenLabsAttr =
    provider === "ElevenLabs" ? `\n      elevenlabsTextNormalization="off"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${escapeXmlAttr(relayUrl)}"${greetingAttr}
      welcomeGreetingInterruptible="any"
      interruptible="any"
      interruptSensitivity="high"
      ignoreBackchannel="false"${elevenLabsAttr}
      ttsProvider="${escapeXmlAttr(provider)}"
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
      temperature: 0.5,
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
  getTtsProvider,
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
