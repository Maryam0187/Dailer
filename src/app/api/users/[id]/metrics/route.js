import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import {
  aggregateCallMetrics,
  conferenceCallIds,
  dateRangeWhere,
} from "@/server/calls/aggregateMetrics";

function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
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
  const fromDate = parseDateOnly(searchParams.get("fromDate"));
  const toDate = parseDateOnly(searchParams.get("toDate"));
  const scope = String(searchParams.get("scope") || "all").trim().toLowerCase();
  const conferenceOnly = scope === "conference";

  if (!fromDate || !toDate) {
    return NextResponse.json({ error: "fromDate and toDate are required" }, { status: 400 });
  }
  if (fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before or equal to toDate" }, { status: 400 });
  }

  const where = {
    userId: target.id,
    ...dateRangeWhere(fromDate, toDate),
  };

  if (conferenceOnly) {
    const ids = await conferenceCallIds();
    if (ids.length === 0) {
      return NextResponse.json({
        metrics: {
          userId: target.id,
          username: target.username,
          total: 0,
          completed: 0,
          noAnswer: 0,
          failedOrCanceled: 0,
          busy: 0,
          durationSeconds: 0,
        },
      });
    }
    where.id = { [Op.in]: ids };
  }

  const metrics = await aggregateCallMetrics(where);
  return NextResponse.json({
    metrics: {
      userId: target.id,
      username: target.username,
      ...metrics,
    },
  });
}
