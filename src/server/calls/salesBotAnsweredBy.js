/**
 * Twilio AMD helpers for Sales Bot.
 * Detection runs on Dial <Number> with DetectMessageEnd (not conference participants).
 *
 * Speak only on exact "human".
 * Stay silent on empty / unknown / machine_start (hold, tone, still listening).
 * Never speak on machine_end_* / fax.
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

/** No timed fallback — only a confirmed person. */
export function canAttachSalesBot(answeredBy) {
  return isHumanAnsweredBy(answeredBy);
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
