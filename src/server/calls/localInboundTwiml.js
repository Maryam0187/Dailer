import {
  busySayTwiml,
  escapeXmlAttr,
  escapeXmlText,
  holdWaitLoopTwiml,
  retryWaitLoopTwiml,
  thanksMessage,
  thanksSayTwiml,
} from "@/server/ivr/ivrRingTwiml";

export function localConnectingMessage() {
  return "Thank you for calling. Please wait while I connect you to our representative.";
}

/** After the hold pause — assigned rep busy / will return the call. */
export function localUnavailableCallbackMessage() {
  return (
    "Thank you for your call. Your assigned extension or representative is either busy or not available at the moment. " +
    "Your assigned representative will call you shortly if they would be available, else they will return your call according to their shift working hours."
  );
}

export function localConnectingSayXml() {
  return `<Say voice="alice">${escapeXmlText(localConnectingMessage())}</Say>`;
}

/**
 * Build Dial TwiML for online admin Client identities (local inbound only).
 */
export function localAdminDialTwiml({
  callerId,
  identities,
  attemptTimeout,
  actionUrl,
  includeGreeting = false,
}) {
  const clients = (identities || [])
    .map((id) => `    <Client>${escapeXmlText(id)}</Client>`)
    .join("\n");
  const callerIdAttr = callerId ? ` callerId="${escapeXmlAttr(callerId)}"` : "";
  const actionAttr = actionUrl
    ? ` action="${escapeXmlAttr(actionUrl)}" method="POST"`
    : "";
  const greeting = includeGreeting ? `  ${localConnectingSayXml()}\n` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${greeting}  <Dial answerOnBridge="true" timeout="${attemptTimeout}" ringTone="us"${callerIdAttr}${actionAttr}>
${clients}
  </Dial>
</Response>`;
}

/** Hold chunk then Redirect — prepend greeting on first pass when needed. */
export function localHoldTwiml({ redirectUrl, baseUrl, chunkSec, includeGreeting = false }) {
  const inner = holdWaitLoopTwiml({ redirectUrl, baseUrl, chunkSec });
  if (!includeGreeting) return inner;
  // Inject Say after <Response>
  return inner.replace(
    "<Response>\n",
    `<Response>\n  ${localConnectingSayXml()}\n`,
  );
}

/**
 * Notify-only answer (local + toll-free connect): greeting → pause → unavailable/callback, no Dial.
 * Pause is 5–10s (default 8) so the caller hears a brief “connecting” wait.
 */
export function localNotifyOnlyTwiml({ pauseSec = 8 } = {}) {
  const pause = Math.max(5, Math.min(10, Number(pauseSec) || 8));
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${localConnectingSayXml()}
  <Pause length="${pause}"/>
  <Say voice="alice">${escapeXmlText(localUnavailableCallbackMessage())}</Say>
  <Hangup/>
</Response>`;
}

export { busySayTwiml, retryWaitLoopTwiml, thanksSayTwiml, thanksMessage, escapeXmlAttr, escapeXmlText };
