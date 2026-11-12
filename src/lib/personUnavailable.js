const AUDIO_URL = "/audio/person-unavailable.mp3";
const DELAY_MS = 10000;

export const PERSON_UNAVAILABLE_ERROR = "The person is not available";

let audioCtx = null;
let cachedBuffer = null;
let timer = null;
let token = 0;
let playing = null;

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

async function loadBuffer(ctx) {
  if (cachedBuffer) return cachedBuffer;
  const res = await fetch(AUDIO_URL);
  if (!res.ok) throw new Error("unavailable audio missing");
  const raw = await res.arrayBuffer();
  cachedBuffer = await ctx.decodeAudioData(raw);
  return cachedBuffer;
}

function speakFallback() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance(PERSON_UNAVAILABLE_ERROR);
  utter.lang = "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

/**
 * Wait 10 seconds, then play the spoken prompt. Does not show the sentence on screen.
 * A newer dial cancels an earlier pending prompt.
 */
export function playPersonUnavailableAfterDelay() {
  const generation = ++token;
  if (timer) clearTimeout(timer);
  if (playing) {
    try {
      playing.stop();
    } catch {
      /* already stopped */
    }
    playing = null;
  }

  const ctx = getContext();
  if (ctx && ctx.state === "suspended") void ctx.resume();
  const bufferPromise = ctx ? loadBuffer(ctx).catch(() => null) : Promise.resolve(null);

  return new Promise((resolve) => {
    timer = setTimeout(() => {
      timer = null;
      void (async () => {
        if (generation !== token) {
          resolve();
          return;
        }
        try {
          const buffer = await bufferPromise;
          if (generation !== token) {
            resolve();
            return;
          }
          if (ctx && buffer) {
            if (ctx.state === "suspended") await ctx.resume();
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start();
            playing = source;
          } else {
            const audio = new Audio(AUDIO_URL);
            await audio.play();
          }
        } catch {
          speakFallback();
        }
        resolve();
      })();
    }, DELAY_MS);
  });
}

export async function unavailableDialResult(json) {
  if (!isPersonUnavailableResponse(json)) return null;
  await playPersonUnavailableAfterDelay();
  return { ok: false, unavailable: true };
}
