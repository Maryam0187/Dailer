/**
 * Twilio AMD helpers for Sales Bot (Dial <Number>, not conference participants).
 *
 * Enable: human | machine_start | fax | unknown (machine_start is often final).
 * DetectMessageEnd: human | machine_end_* | fax (can stay empty while listening).
 *
 * Attach when:
 * - human, OR
 * - AMD never arrives / machine_start hold has lasted long enough (presumeLive).
 * Never attach on finished machine_end_* / fax.
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
 * @param {{ presumeLive?: boolean }} [opts]
 */
export function canAttachSalesBot(answeredBy, opts = {}) {
  if (isFinishedMachineAnsweredBy(answeredBy)) return false;
  if (isHumanAnsweredBy(answeredBy)) return true;
  // Twilio never sent a final AMD result, or only machine_start during hold.
  return Boolean(opts.presumeLive);
}

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
