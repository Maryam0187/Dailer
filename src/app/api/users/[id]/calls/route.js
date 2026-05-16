import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canViewTargetCalls } from "@/server/auth/userAccess";

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

export async function GET(req, { params }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const target = await db.User.findByPk(id, {
    attributes: ["id", "role", "managerId", "supervisorId"],
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await canViewTargetCalls(authedUser, target);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 20), 100);
  const offset = (page - 1) * pageSize;
  const fromDate = parseDateOnly(searchParams.get("fromDate"));
  const toDate = parseDateOnly(searchParams.get("toDate"));
  const hasRecording =
    searchParams.get("hasRecording") === "true" ||
    searchParams.get("hasRecording") === "1";

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    return NextResponse.json(
      { error: "fromDate and toDate must both be provided" },
      { status: 400 },
    );
  }
  if (fromDate && toDate && fromDate > toDate) {
    return NextResponse.json(
      { error: "fromDate must be before or equal to toDate" },
      { status: 400 },
    );
  }

  const where = { userId: target.id };
  if (fromDate && toDate) {
    const after = new Date(`${fromDate}T00:00:00.000Z`);
    const before = new Date(`${toDate}T23:59:59.999Z`);
    where.createdAt = { [Op.between]: [after, before] };
  }
  if (hasRecording) {
    where.recordingSid = { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] };
  }

  const { rows, count } = await db.CallLog.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    offset,
    limit: pageSize,
    attributes: [
      "id",
      "userId",
      "fromNumber",
      "toNumber",
      "direction",
      "status",
      "durationSeconds",
      "recordingSid",
      "recordingStatus",
      "recordingDurationSeconds",
      "createdAt",
    ],
  });

  return NextResponse.json({
    calls: rows.map((call) => ({
      id: call.id,
      userId: call.userId,
      fromNumber: call.fromNumber,
      toNumber: call.toNumber,
      direction: call.direction,
      status: call.status,
      durationSeconds: call.durationSeconds,
      recordingStatus: call.recordingStatus || null,
      recordingDurationSeconds: call.recordingDurationSeconds ?? null,
      recordingDownloadUrl: call.recordingSid
        ? `/api/calls/recording/download/${call.id}`
        : null,
      createdAt: call.createdAt,
    })),
    pagination: {
      page,
      pageSize,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / pageSize)),
      hasNext: offset + rows.length < count,
      hasPrev: page > 1,
    },
  });
}
