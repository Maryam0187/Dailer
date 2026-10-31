import { NextResponse } from "next/server";
import { Op } from "sequelize";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { getShiftSettings } from "@/server/auth/shiftSettings";
import db from "@/server/db";
import { andWhereClause, resolveLeadsListWhere } from "@/server/leads/leadAccess";
import { leadListIncludes, serializeLead } from "@/server/leads/serializeLead";

function parsePositiveInt(raw, fallback) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return n;
}

/**
 * Admin sees every user's appointments. Everyone else sees only appointments
 * on leads assigned to them or created by them.
 */
async function resolveAppointmentAccessWhere(authedUser) {
  const accessWhere = await resolveLeadsListWhere(authedUser);
  if (!accessWhere || authedUser.role === "admin") return accessWhere;
  return andWhereClause(accessWhere, {
    [Op.or]: [{ assignedUserId: authedUser.id }, { createdByUserId: authedUser.id }],
  });
}

function emptyPayload(timezone, pageSize) {
  return {
    appointments: [],
    timezone,
    counts: { upcoming: 0, all: 0 },
    pagination: {
      page: 1,
      pageSize,
      total: 0,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  };
}

/** Saved lead appointments. Upcoming = still ahead. All = every saved appointment, including past. */
export async function GET(request) {
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(request.url);
  const scope = String(searchParams.get("scope") || "upcoming").trim().toLowerCase();
  if (scope !== "upcoming" && scope !== "all") {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }

  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 25), 100);
  const shiftKey = authedUser.shiftKey === "night" ? "night" : "day";
  const { timezone } = getShiftSettings(shiftKey);

  const accessWhere = await resolveAppointmentAccessWhere(authedUser);
  if (!accessWhere) {
    if (searchParams.get("countOnly") === "1") {
      return NextResponse.json({ upcomingCount: 0 });
    }
    return NextResponse.json(emptyPayload(timezone, pageSize));
  }

  const now = new Date();
  const allWhere = andWhereClause(accessWhere, {
    leadContactTag: "appointment",
    leadAppointmentAt: { [Op.ne]: null },
  });
  const upcomingWhere = andWhereClause(allWhere, {
    leadAppointmentAt: { [Op.gte]: now },
  });

  if (searchParams.get("countOnly") === "1") {
    const upcomingCount = await db.Lead.count({ where: upcomingWhere });
    return NextResponse.json({ upcomingCount });
  }

  const where = scope === "upcoming" ? upcomingWhere : allWhere;
  const order =
    scope === "upcoming"
      ? [
          ["leadAppointmentAt", "ASC"],
          ["id", "ASC"],
        ]
      : [
          ["leadAppointmentAt", "DESC"],
          ["id", "DESC"],
        ];
  const offset = (page - 1) * pageSize;

  const [upcomingCount, allCount, result] = await Promise.all([
    db.Lead.count({ where: upcomingWhere }),
    db.Lead.count({ where: allWhere }),
    db.Lead.findAndCountAll({
      where,
      order,
      offset,
      limit: pageSize,
      include: leadListIncludes,
      distinct: true,
    }),
  ]);

  const total = scope === "upcoming" ? upcomingCount : allCount;

  return NextResponse.json({
    appointments: result.rows.map((lead) =>
      serializeLead(lead, null, authedUser.role, authedUser.id),
    ),
    timezone,
    counts: { upcoming: upcomingCount, all: allCount },
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNext: offset + result.rows.length < total,
      hasPrev: page > 1,
    },
  });
}
