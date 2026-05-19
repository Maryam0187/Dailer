/**
 * Shared helpers for Twilio <Conference> voice URLs (add-agent, upgrade from direct dial).
 */

export function createConferenceName({ userId }) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `dialer-${userId}-${ts}-${rand}`;
}

export function buildConferenceVoiceUrl(baseUrl, conferenceName, participant, options = {}) {
  const qs = new URLSearchParams({
    conferenceName,
    participant,
  });
  if (options.muteOnEntry) qs.set("muteOnEntry", "1");
  return `${baseUrl}/api/twilio/voice?${qs.toString()}`;
}

export function getRequestBaseUrlFromRequest(req) {
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host");
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`;

  const host = req.headers.get("host");
  if (host) {
    const isLocalHost =
      host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
    const protocol = isLocalHost ? "http" : "https";
    return `${protocol}://${host}`;
  }

  return req?.nextUrl?.origin || null;
}

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

/**
 * Inline TwiML for redirecting live legs into Conference (upgrade from direct &lt;Dial&gt;).
 * Prefer `calls.update({ twiml })` over `url`; URL redirects frequently fail mid-&lt;Dial&gt;.
 *
 * Mirrors `/api/twilio/voice` (Dial + Conference noun attributes).
 */
export function buildConferenceTwiMl(opts) {
  const conferenceName = String(opts?.conferenceName || "").trim();
  const participant = String(opts?.participant || "agent").trim().toLowerCase();
  const muteOnEntry = Boolean(opts?.muteOnEntry);
  const callerId = String(opts?.callerId || "").trim();

  if (!conferenceName) throw new Error("conferenceName is required");

  const callerIdAttr = callerId ? ` callerId="${escapeXmlAttr(callerId)}"` : "";
  const startConferenceOnEnter = participant === "agent" || participant === "transfer" ? "true" : "false";
  const endConferenceOnExit = participant === "customer" ? "true" : "false";
  const muted = muteOnEntry ? "true" : "false";

  const statusCallbackAbsoluteUrl = String(opts?.statusCallbackUrl || "").trim();
  /** First participant locks these values on Twilio; keep URLs identical on every leg. */
  const statusAttrs = statusCallbackAbsoluteUrl
    ? ` statusCallback="${escapeXmlAttr(statusCallbackAbsoluteUrl)}" statusCallbackEvent="start end join leave" statusCallbackMethod="POST"`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true"${callerIdAttr}>
    <Conference
      startConferenceOnEnter="${startConferenceOnEnter}"
      endConferenceOnExit="${endConferenceOnExit}"
      muted="${muted}"
      beep="false"${statusAttrs}
    >${escapeXmlText(conferenceName)}</Conference>
  </Dial>
</Response>`;
}

/** Public webhook path for `<Conference statusCallback>` (append to app origin). */
export function buildConferenceStatusCallbackPath() {
  return "/api/twilio/conference-status";
}

export function buildConferenceStatusCallbackUrl(baseUrl) {
  const origin = String(baseUrl || "").replace(/\/$/, "");
  if (!origin) return "";
  return `${origin}${buildConferenceStatusCallbackPath()}`;
}

export function getDefaultTwilioCallerId() {
  return (
    String(process.env.TWILIO_PHONE_NUMBER || "").trim() ||
    String(process.env.TWILIO_FROM_NUMBER || "").trim() ||
    ""
  );
}
