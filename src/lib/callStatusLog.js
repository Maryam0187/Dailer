/** Browser DevTools logging for Voice SDK call state (`[dialer:call-status]`). */

function parsePublicLogFlag(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).toLowerCase().trim().replace(/^['"]|['"]$/g, "");
  if (s === "false" || s === "0" || s === "off" || s === "no") return false;
  if (s === "true" || s === "1" || s === "on" || s === "yes") return true;
  return null;
}

function hostnameLooksNonProd() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.startsWith("127.0.0.1") ||
    host.includes("staging") ||
    host.includes(".up.railway.app") ||
    host.includes("-beta.") ||
    host.endsWith(".vercel.app")
  );
}

/**
 * Prefer `localStorage` so you can turn logs on/off without rebuilding:
 * `localStorage.setItem('dialer:callStatusLog', '1')` then reload.
 * Disable: `removeItem('dialer:callStatusLog')` or set `'0'`.
 */
export function shouldLogCallStatus() {
  if (typeof window === "undefined") return false;

  try {
    const ls = window.localStorage?.getItem("dialer:callStatusLog");
    const parsedLs = parsePublicLogFlag(ls);
    if (parsedLs === false) return false;
    if (parsedLs === true) return true;
  } catch {
    /* ignore storage blocked */
  }

  const pub = parsePublicLogFlag(process.env.NEXT_PUBLIC_CALL_STATUS_LOG);
  if (pub === false) return false;
  if (pub === true) return true;

  if (process.env.NODE_ENV === "development") return true;
  if (hostnameLooksNonProd()) return true;

  return false;
}

/**
 * Uses `console.log` (not `.info`) so logs show under Chrome “Default levels”.
 * Filter console by: `[dialer:call-status]`
 *
 * @param {string} source
 * @param {Record<string, unknown>} detail
 */
export function logClientCallStatus(source, detail = {}) {
  if (!shouldLogCallStatus()) return;
  console.log("[dialer:call-status]", source, detail);
}
