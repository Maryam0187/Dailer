const RING_URL = "/audio/ringback.mp3";
const MESSAGE_URL = "/audio/person-unavailable.mp3";
const SPOKEN_MESSAGE =
  "The person you are trying to reach is not available right now.";

export const PERSON_UNAVAILABLE_ERROR = "The person is not available";

let audioCtx = null;
const cachedBuffers = new Map();
let timer = null;
let token = 0;
let playing = null;
let htmlAudio = null;
let finishActive = null;

function getContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

/** Unlock playback during the click that starts the dial. */
export function primePersonUnavailableAudio() {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", primePersonUnavailableAudio, { capture: true });
}

export function isPersonUnavailableResponse(json) {
  return json?.error === PERSON_UNAVAILABLE_ERROR && json?.status === "no-answer";
}

export function unavailableDialResult(json) {
  if (!isPersonUnavailableResponse(json)) return null;
  return { ok: false, unavailable: true, call: json.call || null };
}

async function loadBuffer(ctx, url) {
  const cached = cachedBuffers.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error("unavailable audio missing");
  const raw = await res.arrayBuffer();
  const decoded = await ctx.decodeAudioData(raw.slice(0));
  cachedBuffers.set(url, decoded);
  return decoded;
}

function stopPlayback() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (playing) {
    try {
      playing.stop();
    } catch {
      /* already stopped */
    }
    playing = null;
  }
  if (htmlAudio) {
    htmlAudio.pause();
    htmlAudio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function finishPlayback() {
  const finish = finishActive;
  finishActive = null;
  if (finish) finish();
}

export function cancelPersonUnavailableAudio() {
  token += 1;
  stopPlayback();
  finishPlayback();
}

function playBuffer(ctx, buffer, generation) {
  return new Promise((resolve) => {
    if (generation !== token) {
      resolve();
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (playing === source) playing = null;
      resolve();
    };
    playing = source;
    try {
      source.start();
    } catch {
      resolve();
    }
  });
}

function playElement(url, generation) {
  return new Promise((resolve) => {
    if (generation !== token) {
      resolve(false);
      return;
    }
    const audio = new Audio(url);
    htmlAudio = audio;
    let settled = false;
    const done = (played) => {
      if (settled) return;
      settled = true;
      if (htmlAudio === audio) htmlAudio = null;
      resolve(played);
    };
    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    audio.play().catch(() => done(false));
  });
}

function speakFallback(generation) {
  return new Promise((resolve) => {
    if (generation !== token || typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    const utter = new SpeechSynthesisUtterance(SPOKEN_MESSAGE);
    utter.lang = "en-US";
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  });
}

async function playClip(ctx, url, generation) {
  if (generation !== token) return false;
  if (ctx) {
    const buffer = await loadBuffer(ctx, url);
    if (generation !== token) return false;
    await playBuffer(ctx, buffer, generation);
    return generation === token;
  }
  return playElement(url, generation);
}

/** Ring for 10 seconds, then play the spoken message. Resolves when the message ends. */
export function playPersonUnavailableAfterDelay() {
  const generation = ++token;
  stopPlayback();
  finishPlayback();

  return new Promise((resolve) => {
    finishActive = resolve;
    void (async () => {
      if (generation !== token) return;
      try {
        const ctx = getContext();
        if (ctx && ctx.state === "suspended") await ctx.resume();
        const rang = await playClip(ctx, RING_URL, generation).catch(() => false);
        if (generation !== token) return;
        const spoke = await playClip(ctx, MESSAGE_URL, generation).catch(() => false);
        if (!rang && !spoke && generation === token) await speakFallback(generation);
        else if (!spoke && generation === token) await speakFallback(generation);
      } catch {
        if (generation === token) await speakFallback(generation);
      }
      if (generation === token) finishPlayback();
    })();
  });
}

/**
 * Open the normal call popup, play the unavailable prompt, then hang up.
 * If the agent ends the call first, the prompt stops.
 */
export async function presentUnavailableCall({ beginSession, endCall, call, session = {} }) {
  const callId = Number(call?.id);
  if (!Number.isInteger(callId) || callId <= 0 || typeof beginSession !== "function") return;

  beginSession({
    callOwnedByMe: true,
    callMode: "direct",
    dialMode: "agent_first",
    toNumber: call.toNumber,
    phoneLabel: call.toNumber,
    ...session,
    callId,
  });

  let cancelled = false;
  const onEnded = (event) => {
    const endedId = Number(event?.detail?.callId);
    if (!Number.isInteger(endedId) || endedId <= 0 || endedId === callId) {
      cancelled = true;
      cancelPersonUnavailableAudio();
    }
  };
  window.addEventListener("call-ended", onEnded);

  try {
    await playPersonUnavailableAfterDelay();
    if (cancelled) return;
    await fetch("/api/calls/end", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId }),
    }).catch(() => {});
    if (cancelled) return;
    if (typeof endCall === "function") await endCall();
  } finally {
    window.removeEventListener("call-ended", onEnded);
  }
}
