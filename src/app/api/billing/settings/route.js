import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";

export const runtime = "nodejs";

async function getCurrentSettings() {
  let settings = await db.BillingSetting.findOne({ order: [["id", "DESC"]] });
  if (!settings) {
    settings = await db.BillingSetting.create({
      fixedMarkupPerCall: 0,
      programmableVoiceMarkupPercent: 0,
      currency: "USD",
      updatedBy: null,
    });
  }
  return settings;
}

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const settings = await getCurrentSettings();
  return NextResponse.json({
    settings: {
      id: settings.id,
      fixedMarkupPerCall: settings.fixedMarkupPerCall,
      programmableVoiceMarkupPercent: settings.programmableVoiceMarkupPercent ?? "0.00",
      currency: settings.currency,
      updatedBy: settings.updatedBy,
      updatedAt: settings.updatedAt,
    },
  });
}

export async function PATCH(req) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  const hasPerCall = body?.fixedMarkupPerCall != null;
  const hasPercent = body?.programmableVoiceMarkupPercent != null;
  if (!hasPerCall && !hasPercent) {
    return NextResponse.json({ error: "No markup settings to save" }, { status: 400 });
  }

  const perCall = Number(body?.fixedMarkupPerCall);
  if (hasPerCall && (!Number.isFinite(perCall) || perCall < 0)) {
    return NextResponse.json(
      { error: "fixedMarkupPerCall must be a non-negative number" },
      { status: 400 },
    );
  }

  const percent = Number(body?.programmableVoiceMarkupPercent);
  if (hasPercent && (!Number.isFinite(percent) || percent < 0 || percent > 1000)) {
    return NextResponse.json(
      { error: "Programmable Voice markup percent must be between 0 and 1000" },
      { status: 400 },
    );
  }

  const settings = await getCurrentSettings();
  if (hasPerCall) settings.fixedMarkupPerCall = perCall.toFixed(2);
  if (hasPercent) settings.programmableVoiceMarkupPercent = percent.toFixed(2);
  settings.updatedBy = authedUser.id;
  await settings.save();

  return NextResponse.json({
    settings: {
      id: settings.id,
      fixedMarkupPerCall: settings.fixedMarkupPerCall,
      programmableVoiceMarkupPercent: settings.programmableVoiceMarkupPercent ?? "0.00",
      currency: settings.currency,
      updatedBy: settings.updatedBy,
      updatedAt: settings.updatedAt,
    },
  });
}
