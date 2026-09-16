import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { parseCompanyAddressBody, serializeCompanyAddress } from "@/server/calls/addressBot";

export const runtime = "nodejs";

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.CompanyAddress.findAll({
    order: [
      ["sortOrder", "ASC"],
      ["id", "ASC"],
    ],
  });

  const includeAddress = authedUser.role === "admin";
  return NextResponse.json({
    addresses: rows.map((row) => serializeCompanyAddress(row, { includeAddress })),
  });
}

export async function POST(req) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  const { data, errors } = parseCompanyAddressBody(body, { requireAll: true });
  if (errors.length) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }

  if (data.sortOrder == null) {
    const max = await db.CompanyAddress.max("sortOrder");
    data.sortOrder = Number.isFinite(Number(max)) ? Number(max) + 1 : 0;
  }

  const row = await db.CompanyAddress.create({
    ...data,
    updatedBy: authedUser.id,
  });

  return NextResponse.json(
    { address: serializeCompanyAddress(row, { includeAddress: true }) },
    { status: 201 },
  );
}
