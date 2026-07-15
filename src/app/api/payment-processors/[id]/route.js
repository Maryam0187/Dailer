import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import {
  invalidatePaymentProcessorRegistry,
  serializePaymentProcessor,
} from "@/server/paymentProcessors/registry";

function trimField(value, maxLen) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

export async function PATCH(req, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid processor id" }, { status: 400 });
  }

  const row = await db.PaymentProcessor.findByPk(id);
  if (!row) return NextResponse.json({ error: "Processor not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update = {};

  if (body.fullName !== undefined) {
    const fullName = trimField(body.fullName, 128);
    if (!fullName) return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    update.fullName = fullName;
  }

  if (body.shortCode !== undefined) {
    const shortCode = trimField(body.shortCode, 32);
    if (!shortCode) return NextResponse.json({ error: "Short code is required" }, { status: 400 });
    update.shortCode = shortCode;
  }

  if (body.tone !== undefined) {
    update.tone = trimField(body.tone, 32) || "zinc";
  }

  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      return NextResponse.json({ error: "Invalid sort order" }, { status: 400 });
    }
    update.sortOrder = sortOrder;
  }

  if (body.active !== undefined) {
    update.active = Boolean(body.active);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await row.update(update);
  invalidatePaymentProcessorRegistry();
  return NextResponse.json({ ok: true, processor: serializePaymentProcessor(row) });
}
