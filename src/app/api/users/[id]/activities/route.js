import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { dateRangeWhere } from "@/server/calls/aggregateMetrics";

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

import { formatLocationLabel } from "@/server/activity/resolveRequestLocation";

function serializeActivity(row) {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    ipAddress: row.ipAddress,
    country: row.country,
    region: row.region,
    city: row.city,
    area: row.area,
    location: formatLocationLabel(row),
    userAgent: row.userAgent,
    sessionId: row.sessionId,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

export async function GET(req, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const userId = Number(rawId);
  if (!Number.isInteger(userId) || userId < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const target = await db.User.findByPk(userId, {
    attributes: ["id", "username"],
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 20), 100);
  const offset = (page - 1) * pageSize;
  const fromDate = parseDateOnly(searchParams.get("fromDate"));
  const toDate = parseDateOnly(searchParams.get("toDate"));

  if (!fromDate || !toDate) {
    return NextResponse.json({ error: "fromDate and toDate are required" }, { status: 400 });
  }
  if (fromDate > toDate) {
    return NextResponse.json(
      { error: "fromDate must be before or equal to toDate" },
      { status: 400 },
    );
  }

  const where = {
    userId: target.id,
    ...dateRangeWhere(fromDate, toDate),
  };

  const { rows, count } = await db.UserActivity.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit: pageSize,
    offset,
  });

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return NextResponse.json({
    activities: rows.map(serializeActivity),
    pagination: {
      page,
      pageSize,
      total: count,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
}
