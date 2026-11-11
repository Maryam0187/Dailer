/**
 * Twilio AMD helpers for Sales Bot (Dial DetectMessageEnd).
 *
 * - human → attach
 * - machine_end_* while the customer leg is still live → attach
 *   (AMD often labels a real person as beep/silence; agent softphone is still on the line)
 * - fax → never attach
 * - machine_start / empty / unknown → wait (hold / still detecting)
 */

export function isFaxAnsweredBy(answeredBy) {
  return (
    String(answeredBy || "")
      .trim()
      .toLowerCase() === "fax"
  );
}

export function isFinishedMachineAnsweredBy(answeredBy) {
  const v = String(answeredBy || "")
    .trim()
    .toLowerCase();
  if (!v) return false;
  if (v === "fax") return true;
  return v.startsWith("machine_end");
}

/** Voicemail-end labels that can be false positives while the line is still live. */
export function isMachineEndAnsweredBy(answeredBy) {
  return String(answeredBy || "")
    .trim()
    .toLowerCase()
    .startsWith("machine_end");
}

/** @deprecated Prefer isFinishedMachineAnsweredBy / isFaxAnsweredBy */
export function isMachineAnsweredBy(answeredBy) {
  return isFinishedMachineAnsweredBy(answeredBy);
}

export function isHumanAnsweredBy(answeredBy) {
  return (
    String(answeredBy || "")
      .trim()
      .toLowerCase() === "human"
  );
}

export function isPendingAnsweredBy(answeredBy) {
  const v = String(answeredBy || "")
    .trim()
    .toLowerCase();
  return !v || v === "unknown" || v === "machine_start";
}

/**
 * @param {string} answeredBy
 * @param {{ liveCustomer?: boolean }} [opts]
 */
export function canAttachSalesBot(answeredBy, opts = {}) {
  if (isFaxAnsweredBy(answeredBy)) return false;
  if (isHumanAnsweredBy(answeredBy)) return true;
  // Live softphone line after machine_end_* — often a person, not a finished voicemail.
  if (opts.liveCustomer && isMachineEndAnsweredBy(answeredBy)) return true;
  return false;
}

export async function waitForAnsweredBy(callRow, { attempts = 12, delayMs = 500 } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let current = callRow;
  for (let i = 0; i < attempts; i++) {
    const answeredBy = String(current?.answeredBy || "")
      .trim()
      .toLowerCase();
    if (answeredBy && answeredBy !== "machine_start" && answeredBy !== "unknown") {
      return answeredBy;
    }
    await sleep(delayMs);
    if (current?.reload) {
      await current.reload({ attributes: ["id", "answeredBy"] }).catch(() => {});
    }
  }
  return String(current?.answeredBy || "").trim() || null;
}
