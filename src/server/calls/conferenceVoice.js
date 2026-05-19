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
