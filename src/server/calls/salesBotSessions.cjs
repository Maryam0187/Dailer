"use strict";

const KEY = "__dialerSalesBotSessions";

function getRegistry() {
  if (!globalThis[KEY]) globalThis[KEY] = new Map();
  return globalThis[KEY];
}

function registerSalesBotSession(callId, session) {
  const id = Number(callId);
  if (!Number.isInteger(id) || id <= 0 || !session) return;
  getRegistry().set(id, session);
}

function unregisterSalesBotSession(callId, session) {
  const id = Number(callId);
  const registry = getRegistry();
  if (registry.get(id) === session) registry.delete(id);
}

function getSalesBotSession(callId) {
  const id = Number(callId);
  const session = getRegistry().get(id);
  if (!session || session.closed) return null;
  return session;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSalesBotSession(callId, timeoutMs = 12000) {
  const deadline = Date.now() + Math.max(500, Number(timeoutMs) || 12000);
  while (Date.now() < deadline) {
    const session = getRegistry().get(Number(callId));
    if (session && !session.closed && session.beginSpeaking) return session;
    await sleep(150);
  }
  return null;
}

async function beginSalesBotSpeech({ callId }) {
  const session = await waitForSalesBotSession(callId, 8000);
  if (!session?.beginSpeaking) {
    return { ok: false, error: "Sales bot is not connected yet." };
  }
  return session.beginSpeaking();
}

module.exports = {
  registerSalesBotSession,
  unregisterSalesBotSession,
  getSalesBotSession,
  waitForSalesBotSession,
  beginSalesBotSpeech,
};
