import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

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

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 20), 100);
  const offset = (page - 1) * pageSize;
  const fromDate = parseDateOnly(searchParams.get("fromDate"));
  const toDate = parseDateOnly(searchParams.get("toDate"));
  /** `conference` = CallLogs that have at least one agent invite (InviteDialLeg) → multi-agent conference. */
  const scope = String(searchParams.get("scope") || "all").trim().toLowerCase();
  const conferenceOnly = scope === "conference";

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    return NextResponse.json({ error: "fromDate and toDate must both be provided" }, { status: 400 });
  }
  if (fromDate && toDate && fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before or equal to toDate" }, { status: 400 });
  }

  const canSeeAllCalls =
    authedUser.role === "admin" ||
    authedUser.role === "manager" ||
    authedUser.role === "supervisor";
  const where = canSeeAllCalls ? {} : { userId: authedUser.id };
  if (conferenceOnly) {
    const legGroups = await db.InviteDialLeg.findAll({
      attributes: ["callLogId"],
      group: ["callLogId"],
      raw: true,
    });
    const conferenceCallIds = legGroups.map((r) => r.callLogId).filter((id) => Number.isInteger(id));
    if (conferenceCallIds.length === 0) {
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
    where.id = { [Op.in]: conferenceCallIds };
  }
  if (fromDate && toDate) {
    const after = new Date(`${fromDate}T00:00:00.000Z`);
    const before = new Date(`${toDate}T23:59:59.999Z`);
    where.createdAt = { [Op.between]: [after, before] };
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
    include: [
      {
        model: db.User,
        as: "user",
        attributes: ["id", "username"],
      },
    ],
  });

  const callIds = rows.map((r) => r.id);
  const inviteRows =
    callIds.length > 0
      ? await db.InviteDialLeg.findAll({
          where: { callLogId: callIds },
          attributes: ["callLogId", "invitedUserId", "inviterUserId"],
          include: [
            {
              model: db.User,
              as: "invitedUser",
              attributes: ["username"],
            },
            {
              model: db.User,
              as: "inviter",
              attributes: ["username"],
            },
          ],
          order: [["createdAt", "ASC"]],
        })
      : [];

  const invitesByCallId = new Map();
  for (const leg of inviteRows) {
    const id = leg.callLogId;
    if (!invitesByCallId.has(id)) invitesByCallId.set(id, []);
    invitesByCallId.get(id).push(leg);
  }

  return NextResponse.json({
    calls: rows.map((call) => {
      const legs = invitesByCallId.get(call.id) || [];
      const distinctInviteeIds = new Set(legs.map((l) => l.invitedUserId).filter(Number.isInteger));
      const invitedAgents = [...distinctInviteeIds]
        .map((uid) => {
          const leg = legs.find((l) => l.invitedUserId === uid);
          return leg?.invitedUser?.username || null;
        })
        .filter(Boolean);
      const inviteDialCount = legs.length;
      const estimatedAgentSlots = 1 + distinctInviteeIds.size;
      const inviterNames = [
        ...new Set(
          legs
            .map((l) => l.inviter?.username || null)
            .filter(Boolean),
        ),
      ];
      const invitedBy =
        inviterNames.length > 0
          ? inviterNames.join(", ")
          : inviteDialCount > 0
            ? call.user?.username || "—"
            : null;

      return {
        id: call.id,
        userId: call.userId,
        agentName: call.user?.username || "—",
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
        inviteDialCount,
        invitedAgents,
        estimatedAgentSlots,
        invitedBy,
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
