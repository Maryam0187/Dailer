import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";

export const runtime = "nodejs";

async function getCurrentSettings() {
  let settings = await db.BillingSetting.findOne({ order: [["id", "DESC"]] });
  if (!settings) {
    settings = await db.BillingSetting.create({
      fixedMarkupPerCall: 0,
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
  const value = body?.fixedMarkupPerCall;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return NextResponse.json(
      { error: "fixedMarkupPerCall must be a non-negative number" },
      { status: 400 },
    );
  }

  const settings = await getCurrentSettings();
  settings.fixedMarkupPerCall = numeric.toFixed(2);
  settings.updatedBy = authedUser.id;
  await settings.save();

  return NextResponse.json({
    settings: {
      id: settings.id,
      fixedMarkupPerCall: settings.fixedMarkupPerCall,
      currency: settings.currency,
      updatedBy: settings.updatedBy,
      updatedAt: settings.updatedAt,
    },
  });
}
