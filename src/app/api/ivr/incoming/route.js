import { NextResponse } from "next/server";
import { assertIvrSecret, parseIvrBody } from "@/server/ivr/parseIvrBody";
import { notifyAdmins } from "@/server/ivr/notifyAdmins";

export const runtime = "nodejs";

export async function POST(req) {
  if (!assertIvrSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await parseIvrBody(req);
  const result = await notifyAdmins({
    type: "incoming",
    from: body.from,
    to: body.to,
    callSid: body.callSid,
  });

  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req) {
  return POST(req);
}
