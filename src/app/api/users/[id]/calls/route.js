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
  const scope = String(searchParams.get("scope") || "all").trim().toLowerCase();
  const conferenceOnly = scope === "conference";

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

  let where;
  if (conferenceOnly) {
    const ownedConfRows = await db.InviteDialLeg.findAll({
      attributes: ["callLogId"],
      group: ["callLogId"],
      raw: true,
    });
    const conferenceCallIds = ownedConfRows
      .map((r) => r.callLogId)
      .filter((cid) => Number.isInteger(cid));

    const invitedRows = await db.InviteDialLeg.findAll({
      where: { invitedUserId: target.id },
      attributes: ["callLogId"],
      group: ["callLogId"],
      raw: true,
    });
    const invitedCallIds = invitedRows
      .map((r) => r.callLogId)
      .filter((cid) => Number.isInteger(cid));

    if (conferenceCallIds.length === 0 && invitedCallIds.length === 0) {
      return NextResponse.json({
        calls: [],
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: page > 1,
        },
      });
    }

    where = {
      [Op.or]: [
        ...(conferenceCallIds.length > 0
          ? [{ [Op.and]: [{ userId: target.id }, { id: { [Op.in]: conferenceCallIds } }] }]
          : []),
        ...(invitedCallIds.length > 0 ? [{ id: { [Op.in]: invitedCallIds } }] : []),
      ],
    };
  } else {
    where = { userId: target.id };
  }
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

  const callIds = rows.map((r) => r.id);
  let invitedNamesByCallId = new Map();
  if (conferenceOnly && callIds.length > 0) {
    const legs = await db.InviteDialLeg.findAll({
      where: { callLogId: callIds },
      attributes: ["callLogId", "invitedUserId"],
      include: [
        {
          model: db.User,
          as: "invitedUser",
          attributes: ["username"],
        },
      ],
      order: [["createdAt", "ASC"]],
    });
    for (const leg of legs) {
      const cid = leg.callLogId;
      const name = String(leg.invitedUser?.username || "").trim();
      if (!name) continue;
      if (!invitedNamesByCallId.has(cid)) invitedNamesByCallId.set(cid, []);
      const list = invitedNamesByCallId.get(cid);
      if (!list.includes(name)) list.push(name);
    }
  }

  return NextResponse.json({
    calls: rows.map((call) => {
      const showInvitedNames = conferenceOnly && call.userId === target.id;
      const invitedToNames = showInvitedNames ? invitedNamesByCallId.get(call.id) || [] : null;
      return {
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
        ...(conferenceOnly ? { invitedToNames } : {}),
      };
    }),
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
