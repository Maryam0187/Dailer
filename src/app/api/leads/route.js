import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { createLeadUpdate } from "@/server/leads/leadUpdates";
import { logLeadUserActivity } from "@/server/activity/logLeadActivity";
import { dateRangeWhere } from "@/server/calls/aggregateMetrics";
import { hasLeadMonitorAccess } from "@/lib/leadRoles";
import {
  agentLeadFilterWhere,
  andWhereClause,
  buildLeadsListWhere,
  buildSupervisorLeadsListWhere,
  canAssignLeadToAgent,
  canFilterLeadsByCreator,
  canFilterLeadsBySupervisor,
  getSupervisorTeamUserIds,
} from "@/server/leads/leadAccess";
import { leadListIncludes, serializeLead } from "@/server/leads/serializeLead";

function trimField(value, maxLen) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

const SERVICE_TYPES = new Set(["dish", "direct", "cable", "streams"]);

function parseServiceType(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (!SERVICE_TYPES.has(normalized)) return undefined;
  return normalized;
}

function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

function parseLeadsOrder(searchParams) {
  const sortBy = searchParams.get("sortBy") === "updatedAt" ? "updatedAt" : "createdAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "ASC" : "DESC";
  const tieBreaker = sortBy === "createdAt" ? "updatedAt" : "createdAt";
  return [
    [sortBy, sortDir],
    [tieBreaker, "DESC"],
  ];
}

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agentIdRaw = searchParams.get("agentId");
  const supervisorIdRaw = searchParams.get("supervisorId");
  const fromDate = parseDateOnly(searchParams.get("fromDate"));
  const toDate = parseDateOnly(searchParams.get("toDate"));
  const agentId = agentIdRaw ? Number(agentIdRaw) : null;
  const supervisorId = supervisorIdRaw ? Number(supervisorIdRaw) : null;

  let where;

  if (agentIdRaw && (!Number.isInteger(agentId) || agentId <= 0)) {
    return NextResponse.json({ error: "Invalid agentId" }, { status: 400 });
  }
  if (supervisorIdRaw && (!Number.isInteger(supervisorId) || supervisorId <= 0)) {
    return NextResponse.json({ error: "Invalid supervisorId" }, { status: 400 });
  }

  if (authedUser.role === "supervisor") {
    if (supervisorIdRaw) {
      return NextResponse.json({ error: "Invalid supervisorId" }, { status: 403 });
    }
    if (agentId) {
      if (!(await canFilterLeadsByCreator(authedUser, agentId))) {
        return NextResponse.json({ error: "Invalid agentId" }, { status: 403 });
      }
    }
    where = buildSupervisorLeadsListWhere(authedUser.id, agentId);
  } else {
    where = await buildLeadsListWhere(authedUser);

    if (supervisorId) {
      if (!(await canFilterLeadsBySupervisor(authedUser, supervisorId))) {
        return NextResponse.json({ error: "Invalid supervisorId" }, { status: 403 });
      }
      const teamUserIds = await getSupervisorTeamUserIds(supervisorId);
      if (teamUserIds.length === 0) {
        where = andWhereClause(where, { assignedUserId: -1 });
      } else if (agentId) {
        if (!teamUserIds.includes(agentId)) {
          return NextResponse.json({ error: "Invalid agentId for supervisor" }, { status: 403 });
        }
        if (!(await canFilterLeadsByCreator(authedUser, agentId))) {
          return NextResponse.json({ error: "Invalid agentId" }, { status: 403 });
        }
        where = andWhereClause(where, agentLeadFilterWhere(agentId));
      } else {
        where = andWhereClause(where, { assignedUserId: { [Op.in]: teamUserIds } });
      }
    } else if (agentId) {
      if (!(await canFilterLeadsByCreator(authedUser, agentId))) {
        return NextResponse.json({ error: "Invalid agentId" }, { status: 403 });
      }
      where = andWhereClause(where, agentLeadFilterWhere(agentId));
    }
  }

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    return NextResponse.json({ error: "fromDate and toDate must both be provided" }, { status: 400 });
  }
  if (fromDate && toDate && fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before or equal to toDate" }, { status: 400 });
  }
  if (fromDate && toDate) {
    where = andWhereClause(where, dateRangeWhere(fromDate, toDate));
  }

  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 25), 100);
  const offset = (page - 1) * pageSize;

  const { rows: leads, count } = await db.Lead.findAndCountAll({
    where,
    order: parseLeadsOrder(searchParams),
    offset,
    limit: pageSize,
    include: leadListIncludes,
    distinct: true,
  });

  return NextResponse.json({
    leads: leads.map((l) => serializeLead(l, null, authedUser.role)),
    pagination: {
      page,
      pageSize,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / pageSize)),
      hasNext: offset + leads.length < count,
      hasPrev: page > 1,
    },
  });
}

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const phone = normalizeToE164(body?.phone);
  const fullName = trimField(body?.fullName, 128);
  const cellRaw = trimField(body?.cellNumber, 32);
  const cellNumber = cellRaw ? normalizeToE164(cellRaw) : null;

  if (!phone) {
    return NextResponse.json({ error: "Valid phone is required" }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  }
  if (cellRaw && !cellNumber) {
    return NextResponse.json({ error: "Valid cell number is required" }, { status: 400 });
  }

  const serviceType = parseServiceType(body?.serviceType);
  if (serviceType === undefined) {
    return NextResponse.json({ error: "Invalid service type" }, { status: 400 });
  }
  const cableName = serviceType === "cable" ? trimField(body?.cableName, 128) : null;
  const streamName = serviceType === "streams" ? trimField(body?.streamName, 128) : null;

  const callLogId = Number(body?.createdFromCallLogId);
  let createdFromCallLogId = null;
  if (Number.isInteger(callLogId) && callLogId > 0) {
    const call = await db.CallLog.findByPk(callLogId);
    if (call && (call.userId === authedUser.id || hasLeadMonitorAccess(authedUser.role))) {
      createdFromCallLogId = call.id;
    }
  }

  const source = "manual";
  const nextCallbackRaw = body?.nextCallbackAt;
  let nextCallbackAt = null;
  if (nextCallbackRaw) {
    const d = new Date(nextCallbackRaw);
    if (!Number.isNaN(d.getTime())) nextCallbackAt = d;
  }

  let assignedUserId = authedUser.id;
  if (authedUser.role === "agent") {
    const agent = await db.User.findByPk(authedUser.id, { attributes: ["id", "supervisorId"] });
    const supervisorId = agent?.supervisorId;
    if (Number.isInteger(supervisorId) && supervisorId > 0) {
      const supervisor = await db.User.findOne({
        where: { id: supervisorId, role: "supervisor", isActive: true },
        attributes: ["id"],
      });
      if (supervisor) assignedUserId = supervisor.id;
    }
  } else if (hasLeadMonitorAccess(authedUser.role) || authedUser.role === "supervisor") {
    const requested = Number(body?.assignedUserId);
    if (Number.isInteger(requested) && requested > 0) {
      if (!(await canAssignLeadToAgent(authedUser, requested))) {
        return NextResponse.json({ error: "Invalid assigned agent" }, { status: 400 });
      }
      assignedUserId = requested;
    }
  }

  const lead = await db.Lead.create({
    phone,
    fullName,
    cellNumber,
    company: trimField(body?.company, 255),
    email: trimField(body?.email, 255),
    city: trimField(body?.city, 128),
    state: trimField(body?.state, 32),
    zipCode: trimField(body?.zipCode, 16),
    serviceType,
    cableName,
    streamName,
    breakdown: trimField(body?.breakdown, 65535),
    notes: trimField(body?.notes, 65535),
    status: "new",
    source,
    nextCallbackAt,
    assignedUserId,
    createdByUserId: authedUser.id,
    createdFromCallLogId,
  });

  const withUser = await db.Lead.findByPk(lead.id, {
    include: leadListIncludes,
  });

  if (createdFromCallLogId) {
    await db.CallLog.update({ leadId: lead.id }, { where: { id: createdFromCallLogId } });
  }

  await createLeadUpdate({
    leadId: lead.id,
    userId: authedUser.id,
    type: "created",
    body: trimField(body?.notes, 65535) ? `Initial notes: ${trimField(body?.notes, 65535)}` : "Lead created",
  });

  await logLeadUserActivity({
    req,
    userId: authedUser.id,
    action: "lead_created",
    leadId: lead.id,
    metadata: {
      leadName: fullName,
      phone,
    },
  });

  return NextResponse.json({ ok: true, lead: serializeLead(withUser, null, authedUser.role) }, { status: 201 });
}
