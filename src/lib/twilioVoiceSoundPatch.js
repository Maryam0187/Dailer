/**
 * Twilio Voice preloads every default sound on Device init; each Sound() constructor
 * calls _play(muted) to prime the element. Browsers can still reject play() with
 * NotAllowedError before a user gesture, and the SDK does not catch those promise
 * rejections (one per sound — DTMF, incoming, outgoing, etc.).
 */
let patched = false;

export async function patchTwilioVoiceSoundsForAutoplayPolicy() {
  if (patched || typeof window === "undefined") return;
  const { default: Sound } = await import("@twilio/voice-sdk/esm/twilio/sound.js");
  if (!Sound?.prototype?._play) return;
  if (Sound.prototype._play.__dialerAutoplayPatched) {
    patched = true;
    return;
  }
  const orig = Sound.prototype._play;
  Sound.prototype._play = function dialerPatchedPlay(...args) {
    const ret = orig.apply(this, args);
    if (ret != null && typeof ret.then === "function") {
      void ret.catch(() => {});
    }
    return ret;
  };
  Object.defineProperty(Sound.prototype._play, "__dialerAutoplayPatched", { value: true });
  patched = true;
}
