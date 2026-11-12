import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { normalizeToE164 } from "@/server/calls/normalizePhone";

export const runtime = "nodejs";

function serialize(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  return {
    id: plain.id,
    phoneNumber: plain.phoneNumber,
    reason: plain.reason || null,
    createdBy: plain.createdBy || null,
    createdByUsername: plain.createdByUser?.username || null,
    createdAt: plain.createdAt,
  };
}

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const rows = await db.BlockedNumber.findAll({
    order: [["createdAt", "DESC"]],
    include: [{ model: db.User, as: "createdByUser", attributes: ["id", "username"] }],
  });

  return NextResponse.json({ numbers: rows.map(serialize) });
}

export async function POST(req) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  const phoneNumber = normalizeToE164(body?.phoneNumber);
  if (!phoneNumber) {
    return NextResponse.json(
      { error: "Enter a valid phone number (E.164 or US 10-digit)" },
      { status: 400 },
    );
  }

  const reason = String(body?.reason || "").trim().slice(0, 255) || null;

  try {
    const created = await db.BlockedNumber.create({
      phoneNumber,
      reason,
      createdBy: authedUser.id,
    });
    const row = await db.BlockedNumber.findByPk(created.id, {
      include: [{ model: db.User, as: "createdByUser", attributes: ["id", "username"] }],
    });
    return NextResponse.json({ number: serialize(row) }, { status: 201 });
  } catch (err) {
    if (err?.name === "SequelizeUniqueConstraintError") {
      return NextResponse.json({ error: "This number is already blocked" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const row = await db.BlockedNumber.findByPk(id);
  if (!row) return NextResponse.json({ error: "Number not found" }, { status: 404 });
  await row.destroy();
  return NextResponse.json({ ok: true });
}
