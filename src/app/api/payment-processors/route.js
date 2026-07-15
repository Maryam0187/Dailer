import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { slugifyProcessorCode } from "@/server/paymentProcessors/defaults";
import {
  invalidatePaymentProcessorRegistry,
  listPaymentProcessors,
  serializePaymentProcessor,
} from "@/server/paymentProcessors/registry";

function trimField(value, maxLen) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const processors = await listPaymentProcessors({ activeOnly: false });
  return NextResponse.json({ processors });
}

export async function POST(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const fullName = trimField(body.fullName, 128);
  const shortCode = trimField(body.shortCode, 32);
  if (!fullName) return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  if (!shortCode) return NextResponse.json({ error: "Short code is required" }, { status: 400 });

  const code =
    slugifyProcessorCode(body.code) || slugifyProcessorCode(fullName) || slugifyProcessorCode(shortCode);
  if (!code) return NextResponse.json({ error: "Code is required" }, { status: 400 });

  const existing = await db.PaymentProcessor.findOne({ where: { code } });
  if (existing) {
    return NextResponse.json({ error: "A processor with this code already exists" }, { status: 409 });
  }

  const maxSort = await db.PaymentProcessor.max("sortOrder");
  const sortOrder =
    Number.isFinite(Number(body.sortOrder)) && Number(body.sortOrder) >= 0
      ? Number(body.sortOrder)
      : (Number(maxSort) || 0) + 10;

  const tone = trimField(body.tone, 32) || "zinc";

  const row = await db.PaymentProcessor.create({
    code,
    fullName,
    shortCode,
    tone,
    sortOrder,
    active: body.active === false ? false : true,
  });

  invalidatePaymentProcessorRegistry();
  return NextResponse.json({ ok: true, processor: serializePaymentProcessor(row) }, { status: 201 });
}
