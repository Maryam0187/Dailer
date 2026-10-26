"use strict";

const crypto = require("crypto");
const {
  getOpenAiApiKey,
  getAddressBotVoice,
  getTtsProvider,
  wrapPlainTextForTts,
  streamOpenAiReply,
  buildConversationRelayTwiml,
  httpsToWss,
  MAX_TRAIN_AUDIO_BYTES,
  isAllowedTrainAudioType,
  transcribeCustomerAudio,
  synthesizeSpeech,
} = require("./addressBotCore.cjs");

const SALES_BOT_LABEL = "sales-bot";
const RELAY_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

const DEFAULT_SALES_BOT_INSTRUCTIONS = [
  "You are a friendly SaaS sales assistant on a live phone call.",
  "You speak first at the start of the call. Introduce yourself briefly and pitch the product clearly.",
  "Sound natural: use contractions, keep replies to a few spoken sentences.",
  "Answer product questions honestly from your training. If you do not know something, say you will have a teammate follow up.",
  "If the person is not interested, thank them politely and offer to end the call.",
  "If they ask not to be called again, acknowledge and stop pitching.",
  "No markdown, lists, SSML, or special characters — this is spoken aloud.",
].join(" ");

function getSalesBotVoice() {
  const env = String(process.env.SALES_BOT_VOICE || "").trim();
  if (env) return env;
  return getAddressBotVoice();
}

function getSalesBotOpenAiModel() {
  return (
    String(process.env.OPENAI_SALES_BOT_MODEL || process.env.OPENAI_ADDRESS_BOT_MODEL || "gpt-4o-mini").trim() ||
    "gpt-4o-mini"
  );
}

function buildWelcomeGreeting(botName) {
  const name = String(botName || "").trim() || "Sales Assistant";
  return `Hi, this is ${name}. Thanks for taking my call — do you have a quick moment?`;
}

function buildSystemPrompt(training = {}) {
  const name = String(training?.name || "").trim() || "Sales Assistant";
  const instructions =
    String(training?.instructions || "").trim() || DEFAULT_SALES_BOT_INSTRUCTIONS;
  const examples = Array.isArray(training?.examples) ? training.examples : [];

  const parts = [
    `You are ${name} on a live outbound sales phone call. A human teammate may be listening silently.`,
    "You lead the conversation from the start of the call.",
    instructions,
    "Keep replies short enough to speak aloud. No markdown, lists, SSML, or special characters.",
  ];

  const usableExamples = examples.filter((ex) => {
    const question = String(ex?.question || "").trim();
    const answer = String(ex?.answer || "").trim();
    return question && answer;
  });
  if (usableExamples.length) {
    parts.push("Follow these examples when the customer says something similar:");
    for (const ex of usableExamples) {
      parts.push(
        `If the customer says: ${String(ex.question).trim()} You should say: ${String(ex.answer).trim()}`,
      );
    }
  }

  return parts.join(" ");
}

async function loadSalesBotTrainingForPrompt() {
  try {
    const db = require("../../../models");
    const profile = await db.SalesBotProfile.findOne({
      order: [["id", "ASC"]],
      attributes: ["name", "instructions"],
    });
    const examples = await db.SalesBotTrainingExample.findAll({
      order: [["id", "ASC"]],
      attributes: ["question", "answer"],
    });
    return {
      name: profile?.name || "Sales Assistant",
      instructions: profile?.instructions || "",
      examples: (examples || []).map((row) => ({
        question: row.question,
        answer: row.answer,
      })),
    };
  } catch (err) {
    console.error("[sales-bot] failed to load training profile:", err?.message || err);
    return { name: "Sales Assistant", instructions: "", examples: [] };
  }
}

function signRelayToken({ callId }) {
  const secret = String(process.env.JWT_SECRET || "");
  const ts = Date.now();
  const body = `sales.${Number(callId)}.${ts}`;
  const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `${ts}.${sig}`;
}

function verifyRelayToken({ callId, token }) {
  const secret = String(process.env.JWT_SECRET || "");
  const raw = String(token || "");
  const dot = raw.indexOf(".");
  if (dot <= 0) return false;
  const ts = Number(raw.slice(0, dot));
  const sig = raw.slice(dot + 1);
  if (!Number.isFinite(ts) || !sig) return false;
  if (Date.now() - ts > RELAY_TOKEN_TTL_MS) return false;
  const body = `sales.${Number(callId)}.${ts}`;
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

function buildRelayUrl(origin, { callId, token }) {
  const qs = new URLSearchParams({
    callId: String(callId),
    token: String(token || ""),
  });
  return `${httpsToWss(origin)}/sales-bot/relay?${qs.toString()}`;
}

async function streamSalesOpenAiReply({ messages, onToken, signal }) {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getSalesBotOpenAiModel(),
      stream: true,
      temperature: 0.6,
      max_tokens: 280,
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
  SALES_BOT_LABEL,
  DEFAULT_SALES_BOT_INSTRUCTIONS,
  getOpenAiApiKey,
  getSalesBotVoice,
  getTtsProvider,
  wrapPlainTextForTts,
  buildConversationRelayTwiml,
  buildWelcomeGreeting,
  buildSystemPrompt,
  loadSalesBotTrainingForPrompt,
  signRelayToken,
  verifyRelayToken,
  buildRelayUrl,
  streamSalesOpenAiReply,
  streamOpenAiReply,
  MAX_TRAIN_AUDIO_BYTES,
  isAllowedTrainAudioType,
  transcribeCustomerAudio,
  synthesizeSpeech,
};
