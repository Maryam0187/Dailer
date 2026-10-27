/**
 * Helpers for Twilio AMD AnsweredBy on Sales Bot calls.
 */

export function isMachineAnsweredBy(answeredBy) {
  const v = String(answeredBy || "")
    .trim()
    .toLowerCase();
  if (!v) return false;
  if (v === "human") return false;
  if (v === "unknown") return false;
  // machine_start | machine_end_beep | machine_end_silence | machine_end_other | fax
  return v.startsWith("machine") || v === "fax";
}

export function isHumanAnsweredBy(answeredBy) {
  return String(answeredBy || "")
    .trim()
    .toLowerCase() === "human";
}

/**
 * Wait for Twilio AMD after the customer leg is live.
 * Returns null if still unknown — callers must not speak until human (or decide to skip).
 * @returns {Promise<string|null>} AnsweredBy or null if still unknown
 */
export async function waitForAnsweredBy(callRow, { attempts = 12, delayMs = 500 } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let current = callRow;
  for (let i = 0; i < attempts; i++) {
    const answeredBy = String(current?.answeredBy || "").trim();
    if (answeredBy) return answeredBy;
    await sleep(delayMs);
    if (current?.reload) {
      await current.reload({ attributes: ["id", "answeredBy"] }).catch(() => {});
    }
  }
  return String(current?.answeredBy || "").trim() || null;
}
