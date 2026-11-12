const AUDIO_URL = "/audio/person-unavailable.mp3";
const DELAY_MS = 10000;

export const PERSON_UNAVAILABLE_ERROR = "The person is not available";

let audioCtx = null;
let cachedBuffer = null;
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

async function loadBuffer(ctx) {
  if (cachedBuffer) return cachedBuffer;
  const res = await fetch(AUDIO_URL);
  if (!res.ok) throw new Error("unavailable audio missing");
  const raw = await res.arrayBuffer();
  cachedBuffer = await ctx.decodeAudioData(raw);
  return cachedBuffer;
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

function playElement(generation) {
  return new Promise((resolve) => {
    if (generation !== token) {
      resolve(false);
      return;
    }
    const audio = new Audio(AUDIO_URL);
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
    const utter = new SpeechSynthesisUtterance(PERSON_UNAVAILABLE_ERROR);
    utter.lang = "en-US";
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  });
}

/** Wait 10 seconds, play the prompt, and resolve when the audio finishes. */
export function playPersonUnavailableAfterDelay() {
  const generation = ++token;
  stopPlayback();
  finishPlayback();

  return new Promise((resolve) => {
    finishActive = resolve;
    timer = setTimeout(() => {
      timer = null;
      void (async () => {
        if (generation !== token) return;
        try {
          const ctx = getContext();
          if (ctx && ctx.state === "suspended") await ctx.resume();
          const buffer = ctx ? await loadBuffer(ctx).catch(() => null) : null;
          if (generation !== token) return;
          if (ctx && buffer) {
            await playBuffer(ctx, buffer, generation);
          } else {
            const played = await playElement(generation);
            if (!played && generation === token) await speakFallback(generation);
          }
        } catch {
          if (generation === token) await speakFallback(generation);
        }
        if (generation === token) finishPlayback();
      })();
    }, DELAY_MS);
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
