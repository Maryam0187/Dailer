import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { requireAdmin } from "@/server/auth/requireAdmin";
import {
  ensureCompanyLeaveDatesLoaded,
  normalizeDateOnly,
  reloadCompanyLeaveDates,
} from "@/server/leave/companyLeaveDates";

export const runtime = "nodejs";

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureCompanyLeaveDatesLoaded();

  const isAdmin = authedUser.role === "admin";
  const rows = await db.CompanyLeaveDate.findAll({
    attributes: isAdmin
      ? ["id", "calendarDate", "label", "createdByUserId", "createdAt"]
      : ["id", "calendarDate", "label"],
    include: isAdmin
      ? [
          {
            model: db.User,
            as: "createdBy",
            attributes: ["id", "username"],
            required: false,
          },
        ]
      : [],
    order: [["calendarDate", "ASC"]],
  });

  return NextResponse.json({
    dates: rows.map((row) => ({
      id: row.id,
      calendarDate: String(row.calendarDate),
      label: row.label || "Company leave",
      ...(isAdmin
        ? {
            createdByUserId: row.createdByUserId,
            createdByUsername: row.createdBy?.username ?? null,
            createdAt: row.createdAt,
          }
        : {}),
    })),
  });
}

export async function POST(req) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const calendarDate = normalizeDateOnly(body?.calendarDate);
  if (!calendarDate) {
    return NextResponse.json({ error: "calendarDate is required (YYYY-MM-DD)" }, { status: 400 });
  }

  let label = null;
  if (body?.label != null) {
    if (typeof body.label !== "string") {
      return NextResponse.json({ error: "label must be a string" }, { status: 400 });
    }
    const trimmed = body.label.trim();
    if (trimmed.length > 255) {
      return NextResponse.json({ error: "label must be at most 255 characters" }, { status: 400 });
    }
    label = trimmed || null;
  }

  const existing = await db.CompanyLeaveDate.findOne({ where: { calendarDate } });
  if (existing) {
    return NextResponse.json({ error: "That date is already marked as leave" }, { status: 409 });
  }

  const row = await db.CompanyLeaveDate.create({
    calendarDate,
    label,
    createdByUserId: authedUser.id,
  });

  await reloadCompanyLeaveDates();

  return NextResponse.json({
    date: {
      id: row.id,
      calendarDate: String(row.calendarDate),
      label: row.label || null,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
    },
  });
}

export async function DELETE(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  const calendarDate = normalizeDateOnly(searchParams.get("calendarDate"));

  if (!Number.isInteger(id) || id < 1) {
    if (!calendarDate) {
      return NextResponse.json({ error: "id or calendarDate is required" }, { status: 400 });
    }
  }

  const where =
    Number.isInteger(id) && id >= 1
      ? { id }
      : { calendarDate };

  const deleted = await db.CompanyLeaveDate.destroy({ where });
  if (!deleted) {
    return NextResponse.json({ error: "Leave date not found" }, { status: 404 });
  }

  await reloadCompanyLeaveDates();
  return NextResponse.json({ ok: true });
}
