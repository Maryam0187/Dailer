import { NextResponse } from "next/server";
import db from "@/server/db";

export const runtime = "nodejs";

function normalizeStatus(status) {
  if (!status || typeof status !== "string") return "unknown";
  return status.toLowerCase();
}

export async function POST(req) {
  const form = await req.formData();
  const callSid = form.get("CallSid");
  const callStatus = form.get("CallStatus");
  const callDuration = form.get("CallDuration");

  if (!callSid || typeof callSid !== "string") {
    return NextResponse.json({ error: "CallSid is required" }, { status: 400 });
  }

  const update = {
    status: normalizeStatus(callStatus),
  };
  if (callDuration != null && callDuration !== "") {
    const parsedDuration = Number(callDuration);
    if (Number.isFinite(parsedDuration)) {
      update.durationSeconds = parsedDuration;
    }
  }

  await db.CallLog.update(update, { where: { twilioSid: callSid } });
  return new NextResponse("OK", { status: 200 });
}
