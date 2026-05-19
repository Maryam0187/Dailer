/** Browser console logging for Voice SDK call state (dev only by default). */

export function shouldLogCallStatus() {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_CALL_STATUS_LOG === "false") return false;
  if (process.env.NEXT_PUBLIC_CALL_STATUS_LOG === "true") return true;
  return process.env.NODE_ENV === "development";
}

/**
 * @param {string} source
 * @param {Record<string, unknown>} detail
 */
export function logClientCallStatus(source, detail = {}) {
  if (!shouldLogCallStatus()) return;
  console.info("[dialer:call-status]", source, detail);
}
