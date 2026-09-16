import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { parseCompanyAddressBody, serializeCompanyAddress } from "@/server/calls/addressBot";

export const runtime = "nodejs";

export async function PATCH(req, { params }) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid address id" }, { status: 400 });
  }

  const row = await db.CompanyAddress.findByPk(id);
  if (!row) return NextResponse.json({ error: "Address not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const { data, errors } = parseCompanyAddressBody(body, { requireAll: false });
  if (errors.length) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await row.update({ ...data, updatedBy: authedUser.id });
  return NextResponse.json({
    address: serializeCompanyAddress(row, { includeAddress: true }),
  });
}

export async function DELETE(_req, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid address id" }, { status: 400 });
  }

  const row = await db.CompanyAddress.findByPk(id);
  if (!row) return NextResponse.json({ error: "Address not found" }, { status: 404 });

  await row.destroy();
  return NextResponse.json({ ok: true });
}
