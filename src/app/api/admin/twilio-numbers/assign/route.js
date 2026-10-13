import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { assignTwilioPhoneNumber } from "@/server/twilio/twilioPhoneNumberAssign";

export const runtime = "nodejs";

export async function POST(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  const result = await assignTwilioPhoneNumber({
    phoneNumber: body?.phoneNumber,
    userId: body?.userId,
    line: body?.line,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  }
  return NextResponse.json(result);
}
