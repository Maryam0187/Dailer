/** Server-side Twilio / CallLog status logging (terminal where Next.js runs). */

function isStagingDeploy() {
  const railwayEnv = String(
    process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || "",
  ).toLowerCase();
  if (railwayEnv === "staging") return true;
  const domain = String(
    process.env.RAILWAY_PUBLIC_DOMAIN ||
      process.env.RAILWAY_STATIC_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "",
  ).toLowerCase();
  return domain.includes("staging");
}

export function shouldLogCallStatus() {
  if (process.env.CALL_STATUS_LOG === "false") return false;
  if (process.env.CALL_STATUS_LOG === "true") return true;
  if (process.env.NODE_ENV === "development") return true;
  if (isStagingDeploy()) return true;
  return false;
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
