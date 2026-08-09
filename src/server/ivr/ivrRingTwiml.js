function escapeXmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXmlText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

export function dialTimeoutSec() {
  const n = Number(process.env.IVR_DIAL_TIMEOUT_SEC);
  if (Number.isInteger(n) && n >= 5 && n <= 120) return n;
  return 45;
}

/** Approx length of one loop of public/sounds/ivr-ringback.mp3 (seconds). */
function ringClipSec() {
  const n = Number(process.env.IVR_RINGBACK_CLIP_SEC);
  if (Number.isFinite(n) && n >= 1 && n <= 60) return n;
  // public/sounds/ivr-ringback.mp3 is ~26s
  return 26;
}

export function busyMessage() {
  return "We're sorry. All representatives are busy with other callers right now. Please try again later. Goodbye.";
}

/**
 * Absolute URL for ringback audio played to the caller when Dial ends early
 * (e.g. admin Device not registered).
 */
export function ringbackUrl(baseUrl) {
  const configured = process.env.IVR_RINGBACK_URL?.trim();
  if (configured) return configured;
  const origin = String(baseUrl || "")
    .trim()
    .replace(/\/$/, "");
  if (!origin) return "";
  return `${origin}/sounds/ivr-ringback.mp3`;
}

/**
 * After Dial fails/no-answer (often instantly if Client offline), fill remaining
 * time with ringback so the caller hears ringing until ~timeout, then busy Say.
 */
export function unansweredAfterDialTwiml({ baseUrl, dialCallDurationSec = 0 }) {
  const timeout = dialTimeoutSec();
  const elapsed = Math.max(0, Number(dialCallDurationSec) || 0);
  const remaining = Math.max(0, timeout - elapsed);
  const clip = ringClipSec();
  const loops = remaining > 0 ? Math.max(1, Math.ceil(remaining / clip)) : 0;
  const audio = ringbackUrl(baseUrl);

  const playXml =
    loops > 0 && audio
      ? `<Play loop="${loops}">${escapeXmlText(audio)}</Play>`
      : remaining > 0
        ? `<Pause length="${Math.min(120, Math.ceil(remaining))}"/>`
        : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${playXml}
  <Say voice="alice">${escapeXmlText(busyMessage())}</Say>
  <Hangup/>
</Response>`;
}

/** No admins to dial — still ring for full timeout, then busy. */
export function busyWithFullRingTwiml(baseUrl) {
  return unansweredAfterDialTwiml({ baseUrl, dialCallDurationSec: 0 });
}

export { escapeXmlAttr, escapeXmlText };
