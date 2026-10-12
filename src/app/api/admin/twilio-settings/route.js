import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import {
  findTwilioMainSettingRow,
  parseTwilioMainSettingsBody,
  serializeTwilioMainSettings,
} from "@/server/twilio/mainSettings";

export const runtime = "nodejs";

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const row = await findTwilioMainSettingRow();
  return NextResponse.json({ settings: serializeTwilioMainSettings(row) });
}

export async function PUT(req) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  const existing = await findTwilioMainSettingRow();
  const parsed = parseTwilioMainSettingsBody(body, existing);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let row;
  if (existing) {
    await existing.update({ ...parsed.data, updatedBy: authedUser.id });
    row = existing;
  } else {
    row = await db.TwilioMainSetting.create({
      ...parsed.data,
      updatedBy: authedUser.id,
    });
  }

  return NextResponse.json({ settings: serializeTwilioMainSettings(row) });
}
