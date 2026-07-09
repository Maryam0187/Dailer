/**
 * Incoming DM notification chime via Web Audio (no static asset).
 * Browsers require a user gesture before audio can play — call
 * unlockMessageSound() on first pointer/key interaction.
 */

let audioCtx = null;
let unlocked = false;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContextCtor();
  }
  return audioCtx;
}

export async function unlockMessageSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    unlocked = true;
  } catch {
    /* autoplay policy — wait for another gesture */
  }
}

function tone(ctx, { frequency, start, duration, gain = 0.25, type = "sine" }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Louder three-note chime for incoming messages. */
export function playIncomingMessageSound() {
  const ctx = getAudioContext();
  if (!ctx || !unlocked) return;

  const start = () => {
    const t0 = ctx.currentTime;
    // Layer sine + triangle for more presence, higher gain than before
    tone(ctx, { frequency: 784, start: t0, duration: 0.14, gain: 0.28, type: "sine" });
    tone(ctx, { frequency: 784, start: t0, duration: 0.14, gain: 0.12, type: "triangle" });
    tone(ctx, { frequency: 988, start: t0 + 0.11, duration: 0.16, gain: 0.3, type: "sine" });
    tone(ctx, { frequency: 988, start: t0 + 0.11, duration: 0.16, gain: 0.12, type: "triangle" });
    tone(ctx, { frequency: 1175, start: t0 + 0.24, duration: 0.22, gain: 0.32, type: "sine" });
    tone(ctx, { frequency: 1175, start: t0 + 0.24, duration: 0.22, gain: 0.14, type: "triangle" });
  };

  if (ctx.state === "suspended") {
    ctx.resume().then(start).catch(() => {});
    return;
  }
  start();
}
