/**
 * Helpers for Twilio AMD AnsweredBy on Sales Bot calls.
 *
 * With MachineDetection=Enable:
 * - human: person confirmed
 * - machine_start: speech/greeting started (often a real person; final result)
 * - unknown: inconclusive
 * - machine_end_* / fax: finished voicemail or fax — do not attach
 */

export function isFinishedMachineAnsweredBy(answeredBy) {
  const v = String(answeredBy || "")
    .trim()
    .toLowerCase();
  if (!v) return false;
  if (v === "fax") return true;
  return v.startsWith("machine_end");
}

/** @deprecated Prefer isFinishedMachineAnsweredBy — machine_start must not block the bot. */
export function isMachineAnsweredBy(answeredBy) {
  return isFinishedMachineAnsweredBy(answeredBy);
}

/**
 * Attach the bot when someone is on the line.
 * machine_start is included because Enable often labels a talking person that way.
 */
export function canAttachSalesBot(answeredBy) {
  const v = String(answeredBy || "")
    .trim()
    .toLowerCase();
  return v === "human" || v === "machine_start" || v === "unknown";
}

export function isPendingAnsweredBy(answeredBy) {
  const v = String(answeredBy || "")
    .trim()
    .toLowerCase();
  return !v;
}

export function isHumanAnsweredBy(answeredBy) {
  return (
    String(answeredBy || "")
      .trim()
      .toLowerCase() === "human"
  );
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
    if (answeredBy) return answeredBy;
    await sleep(delayMs);
    if (current?.reload) {
      await current.reload({ attributes: ["id", "answeredBy"] }).catch(() => {});
    }
  }
  return String(current?.answeredBy || "").trim() || null;
}
