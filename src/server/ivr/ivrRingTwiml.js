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

/** Total time the caller may wait in the Dial wait-loop (seconds). */
export function waitLoopTotalSec() {
  const n = Number(process.env.IVR_DIAL_TIMEOUT_SEC);
  if (Number.isInteger(n) && n >= 5 && n <= 180) return n;
  return 45;
}

/** Max seconds for a single <Dial> attempt inside the wait-loop. */
export function dialAttemptSec() {
  const n = Number(process.env.IVR_DIAL_ATTEMPT_SEC);
  if (Number.isInteger(n) && n >= 5 && n <= 60) return n;
  return 12;
}

/** Brief pause between Dial attempts (seconds). */
export function waitGapSec() {
  const n = Number(process.env.IVR_WAIT_GAP_SEC);
  if (Number.isInteger(n) && n >= 0 && n <= 15) return n;
  return 2;
}

export function dialTimeoutSec() {
  return waitLoopTotalSec();
}

export function busyMessage() {
  return "We're sorry. All representatives are busy with other callers right now. Please try again later. Goodbye.";
}

export function ringbackUrl(baseUrl) {
  const configured = process.env.IVR_RINGBACK_URL?.trim();
  if (configured) return configured;
  const origin = String(baseUrl || "")
    .trim()
    .replace(/\/$/, "");
  if (!origin) return "";
  return `${origin}/sounds/ivr-ringback.mp3`;
}

export function busySayTwiml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXmlText(busyMessage())}</Say>
  <Hangup/>
</Response>`;
}

/** Full-timeout ring (no admins configured), then busy. */
export function busyWithFullRingTwiml(baseUrl) {
  const audio = ringbackUrl(baseUrl);
  const total = waitLoopTotalSec();
  const playXml = audio
    ? `<Play loop="${Math.max(1, Math.ceil(total / 26))}">${escapeXmlText(audio)}</Play>`
    : `<Pause length="${total}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${playXml}
  <Say voice="alice">${escapeXmlText(busyMessage())}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Between Dial attempts: short gap (caller already heard ringTone during Dial),
 * then Redirect back into the wait-loop so a newly registered admin can be dialed.
 */
export function retryWaitLoopTwiml({ redirectUrl, gapSec }) {
  const gap = Math.max(0, Number(gapSec) || 0);
  const pauseXml = gap > 0 ? `<Pause length="${Math.min(15, gap)}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${pauseXml}
  <Redirect method="POST">${escapeXmlText(redirectUrl)}</Redirect>
</Response>`;
}

export function buildIvrLoopQuery(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value == null || value === "") continue;
    qs.set(key, String(value));
  }
  const secret = process.env.IVR_WEBHOOK_SECRET?.trim();
  if (secret) qs.set("secret", secret);
  return qs.toString();
}

export { escapeXmlAttr, escapeXmlText };
