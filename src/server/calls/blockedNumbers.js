import { NextResponse } from "next/server";
import db from "@/server/db";
import { normalizeToE164 } from "@/server/calls/normalizePhone";

export const PERSON_UNAVAILABLE_ERROR = "The person is not available";

export async function isOutboundNumberBlocked(rawNumber) {
  const phoneNumber = normalizeToE164(rawNumber);
  if (!phoneNumber) return false;
  const row = await db.BlockedNumber.findOne({
    where: { phoneNumber },
    attributes: ["id"],
  });
  return Boolean(row);
}

/**
 * When the destination is on the block list, save a no-answer call log and
 * return a 400 response. Returns null when the dial may continue.
 * Does not place a Twilio or Zoom call and does not change lead status.
 *
 * @param {string} normalizedToNumber
 * @param {Record<string, unknown>} callFields
 */
export async function rejectIfOutboundBlocked(normalizedToNumber, callFields) {
  if (!(await isOutboundNumberBlocked(normalizedToNumber))) return null;

  const call = await db.CallLog.create({
    direction: "outbound",
    dialMode: "agent_first",
    voiceProvider: "twilio",
    twilioSid: null,
    durationSeconds: 0,
    ...callFields,
    toNumber: normalizedToNumber,
    status: "no-answer",
  });

  const leadId = Number(callFields?.leadId);
  if (Number.isInteger(leadId) && leadId > 0) {
    try {
      const { bumpLeadCallLogsCount } = await import("@/server/leads/bumpLeadCallLogsCount");
      await bumpLeadCallLogsCount(leadId, 1);
    } catch {
      /* count is best-effort */
    }
  }

  return NextResponse.json(
    {
      error: PERSON_UNAVAILABLE_ERROR,
      status: "no-answer",
      call,
    },
    { status: 400 },
  );
}
