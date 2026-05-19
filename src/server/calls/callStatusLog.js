/** Server-side Twilio / CallLog status logging (terminal where Next.js runs). */

export function shouldLogCallStatus() {
  if (process.env.CALL_STATUS_LOG === "false") return false;
  if (process.env.CALL_STATUS_LOG === "true") return true;
  return process.env.NODE_ENV === "development";
}

/**
 * @param {object} payload
 * @param {string} payload.source
 * @param {number} [payload.callId]
 * @param {"agent"|"customer"} [payload.leg]
 * @param {string} [payload.status]
 * @param {string} [payload.callSid]
 * @param {number|null} [payload.durationSeconds]
 * @param {Record<string, unknown>} [payload.extra]
 */
export function logCallStatus(payload) {
  if (!shouldLogCallStatus()) return;

  const parts = [
    `[dialer:call-status]`,
    payload.source,
    payload.callId != null ? `callId=${payload.callId}` : null,
    payload.leg ? `leg=${payload.leg}` : null,
    payload.status ? `status=${payload.status}` : null,
    payload.callSid ? `sid=${payload.callSid}` : null,
    payload.durationSeconds != null ? `duration=${payload.durationSeconds}s` : null,
  ].filter(Boolean);

  const line = parts.join(" ");
  if (payload.extra && Object.keys(payload.extra).length > 0) {
    console.info(line, payload.extra);
  } else {
    console.info(line);
  }
}
