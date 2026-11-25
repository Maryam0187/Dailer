import { NextResponse } from "next/server";
import { Op } from "sequelize";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { getShiftSettings } from "@/server/auth/shiftSettings";
import db from "@/server/db";
import { andWhereClause, resolveLeadsListWhere } from "@/server/leads/leadAccess";
import { leadListIncludes, serializeLead } from "@/server/leads/serializeLead";
import { resolveUserCountry } from "@/lib/countries";
import { CAMPAIGN_SOFTWARE, normalizeCampaign } from "@/lib/campaigns";
import { softwareLeadListWhere } from "@/server/softwareLeads/access";
import { serializeSoftwareLead, softwareLeadIncludes } from "@/server/softwareLeads/serialize";

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

  const softwareOnly =
    authedUser.role !== "admin" && normalizeCampaign(authedUser.campaign) === CAMPAIGN_SOFTWARE;
  const requestedCampaign = String(searchParams.get("campaign") || "").trim().toLowerCase();
  let includeTv = !softwareOnly;
  let includeSoftware = softwareOnly || authedUser.role === "admin";
  if (
    authedUser.role === "admin" &&
    (requestedCampaign === "tv" || requestedCampaign === CAMPAIGN_SOFTWARE)
  ) {
    includeTv = requestedCampaign === "tv";
    includeSoftware = requestedCampaign === CAMPAIGN_SOFTWARE;
  }

  let listCountry = null;
  if (includeTv) {
    const countryCheck = resolveUserCountry(authedUser, searchParams.get("country"));
    if (countryCheck.error) {
      return NextResponse.json({ error: countryCheck.error }, { status: 403 });
    }
    listCountry = countryCheck.country;
  }

  const accessWhere = includeTv ? await resolveAppointmentAccessWhere(authedUser) : null;
  if (includeTv && !accessWhere && !includeSoftware) {
    if (searchParams.get("countOnly") === "1") {
      return NextResponse.json({ upcomingCount: 0 });
    }
    return NextResponse.json(emptyPayload(timezone, pageSize));
  }

  const now = new Date();
  const tvAllWhere = accessWhere
    ? andWhereClause(accessWhere, {
        country: listCountry,
        leadContactTag: "appointment",
        leadAppointmentAt: { [Op.ne]: null },
      })
    : null;
  const tvUpcomingWhere = tvAllWhere
    ? andWhereClause(tvAllWhere, { leadAppointmentAt: { [Op.gte]: now } })
    : null;
  const softwareBase = andWhereClause(softwareLeadListWhere(authedUser), {
    leadContactTag: "appointment",
    leadAppointmentAt: { [Op.ne]: null },
  });
  const softwareUpcomingWhere = andWhereClause(softwareBase, {
    leadAppointmentAt: { [Op.gte]: now },
  });

  const [tvUpcomingCount, tvAllCount, softwareUpcomingCount, softwareAllCount] = await Promise.all([
    tvUpcomingWhere ? db.Lead.count({ where: tvUpcomingWhere }) : 0,
    tvAllWhere ? db.Lead.count({ where: tvAllWhere }) : 0,
    includeSoftware ? db.SoftwareLead.count({ where: softwareUpcomingWhere }) : 0,
    includeSoftware ? db.SoftwareLead.count({ where: softwareBase }) : 0,
  ]);
  const upcomingCount = tvUpcomingCount + softwareUpcomingCount;
  const allCount = tvAllCount + softwareAllCount;

  if (searchParams.get("countOnly") === "1") {
    return NextResponse.json({ upcomingCount });
  }

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
  const window = offset + pageSize;
  const tvWhere = scope === "upcoming" ? tvUpcomingWhere : tvAllWhere;
  const softwareWhere = scope === "upcoming" ? softwareUpcomingWhere : softwareBase;

  const [tvRows, softwareRows] = await Promise.all([
    tvWhere
      ? db.Lead.findAll({
          where: tvWhere,
          order,
          limit: window,
          include: leadListIncludes,
        })
      : [],
    includeSoftware
      ? db.SoftwareLead.findAll({
          where: softwareWhere,
          order,
          limit: window,
          include: softwareLeadIncludes,
        })
      : [],
  ]);

  const direction = scope === "upcoming" ? 1 : -1;
  const merged = [
    ...tvRows.map((lead) => ({
      ...serializeLead(lead, null, authedUser.role, authedUser.id),
      campaign: "tv",
      href: `/leads/${lead.id}`,
      appointmentKey: `tv-${lead.id}`,
    })),
    ...softwareRows.map((lead) => ({
      ...serializeSoftwareLead(lead),
      appointmentKey: `software-${lead.id}`,
    })),
  ].sort((a, b) => {
    const at = new Date(a.leadAppointmentAt).getTime() - new Date(b.leadAppointmentAt).getTime();
    if (at !== 0) return at * direction;
    return a.id - b.id;
  });
  const pageRows = merged.slice(offset, offset + pageSize);
  const total = scope === "upcoming" ? upcomingCount : allCount;

  return NextResponse.json({
    appointments: pageRows,
    timezone,
    counts: { upcoming: upcomingCount, all: allCount },
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNext: offset + pageRows.length < total,
      hasPrev: page > 1,
    },
  });
}
