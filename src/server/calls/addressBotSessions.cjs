"use strict";

const KEY = "__dialerAddressBotSessions";

function getRegistry() {
  if (!globalThis[KEY]) globalThis[KEY] = new Map();
  return globalThis[KEY];
}

function registerAddressBotSession(callId, session) {
  const id = Number(callId);
  if (!Number.isInteger(id) || id <= 0 || !session) return;
  getRegistry().set(id, session);
}

function unregisterAddressBotSession(callId, session) {
  const id = Number(callId);
  const registry = getRegistry();
  if (registry.get(id) === session) registry.delete(id);
}

function getAddressBotSession(callId) {
  const id = Number(callId);
  const session = getRegistry().get(id);
  if (!session || session.closed) return null;
  return session;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAddressBotSession(callId, timeoutMs = 12000) {
  const deadline = Date.now() + Math.max(500, Number(timeoutMs) || 12000);
  while (Date.now() < deadline) {
    const session = getAddressBotSession(callId);
    if (session?.beginSpeaking) return session;
    await sleep(150);
  }
  return null;
}

async function beginAddressBotSpeech({ callId, addressId }) {
  const session = await waitForAddressBotSession(callId, 8000);
  if (!session?.beginSpeaking) {
    return { ok: false, error: "Address bot is not connected yet. Click Ready bot first." };
  }
  return session.beginSpeaking(addressId);
}

module.exports = {
  registerAddressBotSession,
  unregisterAddressBotSession,
  getAddressBotSession,
  waitForAddressBotSession,
  beginAddressBotSpeech,
};
