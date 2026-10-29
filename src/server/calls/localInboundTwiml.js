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
  return "Thank you for calling. Please hold while we connect you to a representative.";
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

/** Notify-only local answer: greeting + thanks, no Dial. */
export function localNotifyOnlyTwiml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${localConnectingSayXml()}
  <Say voice="alice">${escapeXmlText(thanksMessage())}</Say>
  <Hangup/>
</Response>`;
}

export { busySayTwiml, retryWaitLoopTwiml, thanksSayTwiml, thanksMessage, escapeXmlAttr, escapeXmlText };
