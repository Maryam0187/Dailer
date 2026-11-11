/**
 * Helpers for Twilio AMD AnsweredBy on Sales Bot calls.
 *
 * With MachineDetection=DetectMessageEnd on Dial:
 * - human: person confirmed (often after hold/greeting ends)
 * - machine_end_*: finished voicemail / announcement — do not attach
 * - fax: do not attach
 * - machine_start: early signal only; wait for the final result
 * - unknown / empty: still waiting
 */

export function isFinishedMachineAnsweredBy(answeredBy) {
  const v = String(answeredBy || "")
    .trim()
    .toLowerCase();
  if (!v) return false;
  if (v === "fax") return true;
  return v.startsWith("machine_end");
}

/** @deprecated Prefer isFinishedMachineAnsweredBy */
export function isMachineAnsweredBy(answeredBy) {
  return isFinishedMachineAnsweredBy(answeredBy);
}

/** Bot attaches only after Twilio confirms a person — not during hold/tone. */
export function canAttachSalesBot(answeredBy) {
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
  // machine_start is not final with DetectMessageEnd — keep waiting.
  return !v || v === "unknown" || v === "machine_start";
}

export function isHumanAnsweredBy(answeredBy) {
  return canAttachSalesBot(answeredBy);
}

/**
 * Wait for Twilio AMD after the customer leg is live.
 * @returns {Promise<string|null>} AnsweredBy or null if still empty
 */
export async function waitForAnsweredBy(callRow, { attempts = 12, delayMs = 500 } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let current = callRow;
  for (let i = 0; i < attempts; i++) {
    const answeredBy = String(current?.answeredBy || "").trim();
    if (answeredBy && answeredBy.toLowerCase() !== "machine_start") return answeredBy;
    await sleep(delayMs);
    if (current?.reload) {
      await current.reload({ attributes: ["id", "answeredBy"] }).catch(() => {});
    }
  }
  return String(current?.answeredBy || "").trim() || null;
}
