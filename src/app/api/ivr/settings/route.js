import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import {
  getIvrSettings,
  updateIvrSettings,
  MIN_CALLBACK_AFFINITY_DAYS,
  MAX_CALLBACK_AFFINITY_DAYS,
} from "@/server/ivr/ivrSettings";

export const runtime = "nodejs";

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const settings = await getIvrSettings();
  return NextResponse.json({
    ok: true,
    settings,
    limits: {
      minDays: MIN_CALLBACK_AFFINITY_DAYS,
      maxDays: MAX_CALLBACK_AFFINITY_DAYS,
    },
  });
}

export async function PATCH(req) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  const raw = body?.callbackAffinityDays;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    return NextResponse.json(
      { error: `callbackAffinityDays must be an integer (${MIN_CALLBACK_AFFINITY_DAYS}–${MAX_CALLBACK_AFFINITY_DAYS})` },
      { status: 400 },
    );
  }
  if (n < MIN_CALLBACK_AFFINITY_DAYS || n > MAX_CALLBACK_AFFINITY_DAYS) {
    return NextResponse.json(
      {
        error: `callbackAffinityDays must be between ${MIN_CALLBACK_AFFINITY_DAYS} and ${MAX_CALLBACK_AFFINITY_DAYS}`,
      },
      { status: 400 },
    );
  }

  const settings = await updateIvrSettings(
    { callbackAffinityDays: n },
    authedUser.id,
  );
  return NextResponse.json({ ok: true, settings });
}
