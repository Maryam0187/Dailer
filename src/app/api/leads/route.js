import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { createLeadUpdate } from "@/server/leads/leadUpdates";
import { logLeadUserActivity } from "@/server/activity/logLeadActivity";
import { dateRangeWhereOn } from "@/server/calls/aggregateMetrics";
import { hasFullLeadAccess, hasLeadMonitorAccess } from "@/lib/leadRoles";
import {
  andWhereClause,
  canAssignLeadToAgent,
  canFilterLeadsByCreator,
  canFilterLeadsBySupervisor,
  leadsCreatedByShiftWhere,
  resolveLeadsListWhere,
} from "@/server/leads/leadAccess";
import { leadListIncludes, serializeLead } from "@/server/leads/serializeLead";
import {
  LEAD_CONTACT_TAG_VALUES,
  LEAD_PROGRESS_MISSING_FILTERS,
  LEAD_PROGRESS_MISSING_VALUES,
  LEAD_PROGRESS_TAG_VALUES,
} from "@/lib/leadWorkflow";
import { Op, Sequelize } from "sequelize";
import { validateListSearchQuery } from "@/lib/listSearchValidation";
import { getStateByCode } from "@/lib/usStates";
import { syncLeadCustomer } from "@/server/customers/syncCustomer";

const SEARCH_BY_VALUES = new Set(["all", "phone", "name", "last4"]);

function progressTagContainsLiteral(tag) {
  return Sequelize.literal(
    `JSON_CONTAINS(\`leadProgressTags\`, ${db.sequelize.escape(JSON.stringify(tag))})`,
  );
}

function progressTagMissingLiteral(tag) {
  return Sequelize.literal(
    `NOT JSON_CONTAINS(\`leadProgressTags\`, ${db.sequelize.escape(JSON.stringify(tag))})`,
  );
}

function trimField(value, maxLen) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function leadPhoneMatchClauses(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  const or = [];
  if (raw) {
    or.push({ phone: { [Op.like]: `%${raw}%` } });
    or.push({ cellNumber: { [Op.like]: `%${raw}%` } });
  }
  if (digits) {
    or.push({ phone: { [Op.like]: `%${digits}%` } });
    or.push({ cellNumber: { [Op.like]: `%${digits}%` } });
    if (digits.length >= 4) {
      const last4 = digits.slice(-4);
      or.push({ phone: { [Op.like]: `%${last4}` } });
      or.push({ cellNumber: { [Op.like]: `%${last4}` } });
    }
    const normalized = normalizeToE164(digits);
    if (normalized) {
      or.push({ phone: normalized });
      or.push({ cellNumber: normalized });
    }
  }
  return or;
}

function buildLeadSearchWhere(q, searchBy) {
  const check = validateListSearchQuery(searchBy, q);
  if (!check.isValid) {
    return { error: check.message };
  }
  if (!check.normalized) return null;

  if (searchBy === "name") {
    return { fullName: { [Op.like]: `%${check.normalized}%` } };
  }

  if (searchBy === "last4") {
    return {
      [Op.or]: [
        { phone: { [Op.like]: `%${check.normalized}` } },
        { cellNumber: { [Op.like]: `%${check.normalized}` } },
      ],
    };
  }

  if (searchBy === "all") {
    return {
      [Op.or]: [
        { fullName: { [Op.like]: `%${check.normalized}%` } },
        ...leadPhoneMatchClauses(check.normalized),
      ],
    };
  }

  const phoneDigits = check.normalized;
  const or = [
    { phone: { [Op.like]: `%${phoneDigits}%` } },
    { cellNumber: { [Op.like]: `%${phoneDigits}%` } },
  ];
  const normalized = normalizeToE164(phoneDigits);
  if (normalized) {
    or.push({ phone: normalized });
    or.push({ cellNumber: normalized });
  }
  return { [Op.or]: or };
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

function parseLeadsDateField(value) {
  const field = String(value || "").trim().toLowerCase();
  if (!field || field === "created") return "createdAt";
  if (field === "updated") return "updatedAt";
  return undefined;
}

function resolveLeadListDateRange({ fromDate, toDate, leadPhase, dateFieldRaw }) {
  if (!fromDate || !toDate) return { clause: null };
  const parsed = parseLeadsDateField(dateFieldRaw);
  if (dateFieldRaw && parsed === undefined) {
    return { error: "Invalid dateField" };
  }
  let field = parsed;
  if (!field) {
    field = leadPhase === "closed" || leadPhase === "cancelled" ? "updatedAt" : "createdAt";
  }
  return { clause: dateRangeWhereOn(field, fromDate, toDate), field };
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
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const agentIdRaw = searchParams.get("agentId");
  const supervisorIdRaw = searchParams.get("supervisorId");
  const fromDate = parseDateOnly(searchParams.get("fromDate"));
  const toDate = parseDateOnly(searchParams.get("toDate"));
  const creatorId = agentIdRaw ? Number(agentIdRaw) : null;
  const supervisorId = supervisorIdRaw ? Number(supervisorIdRaw) : null;
  const assignedScopeRaw = searchParams.get("assignedScope");
  const processorScopeRaw = searchParams.get("processorScope");

  let where;

  if (assignedScopeRaw && assignedScopeRaw !== "other_team") {
    return NextResponse.json({ error: "Invalid assignedScope" }, { status: 400 });
  }
  if (processorScopeRaw && processorScopeRaw !== "assigned" && processorScopeRaw !== "own") {
    return NextResponse.json({ error: "Invalid processorScope" }, { status: 400 });
  }
  const isFullAccessRole = hasFullLeadAccess(authedUser.role);
  if (assignedScopeRaw && authedUser.role !== "supervisor" && !isFullAccessRole) {
    return NextResponse.json({ error: "Invalid assignedScope" }, { status: 403 });
  }
  if (processorScopeRaw && authedUser.role !== "processor") {
    return NextResponse.json({ error: "Invalid processorScope" }, { status: 403 });
  }
  if (assignedScopeRaw && isFullAccessRole && !supervisorIdRaw) {
    return NextResponse.json({ error: "assignedScope requires a supervisor" }, { status: 400 });
  }

  if (agentIdRaw && (!Number.isInteger(creatorId) || creatorId <= 0)) {
    return NextResponse.json({ error: "Invalid agentId" }, { status: 400 });
  }
  if (supervisorIdRaw && (!Number.isInteger(supervisorId) || supervisorId <= 0)) {
    return NextResponse.json({ error: "Invalid supervisorId" }, { status: 400 });
  }

  if (authedUser.role === "supervisor" && supervisorIdRaw) {
    return NextResponse.json({ error: "Invalid supervisorId" }, { status: 403 });
  }

  if (creatorId && !(await canFilterLeadsByCreator(authedUser, creatorId))) {
    return NextResponse.json({ error: "Invalid agentId" }, { status: 403 });
  }

  if (supervisorId && !(await canFilterLeadsBySupervisor(authedUser, supervisorId))) {
    return NextResponse.json({ error: "Invalid supervisorId" }, { status: 403 });
  }

  where = await resolveLeadsListWhere(authedUser, {
    creatorId,
    supervisorId: authedUser.role === "supervisor" ? null : supervisorId,
    assignedScope: assignedScopeRaw,
    processorScope: processorScopeRaw,
  });

  if (!where) {
    return NextResponse.json({ error: "Invalid agentId" }, { status: 403 });
  }

  const shiftKeyRaw = String(searchParams.get("shiftKey") || "").trim().toLowerCase();
  if (shiftKeyRaw && shiftKeyRaw !== "all" && shiftKeyRaw !== "combined") {
    if (shiftKeyRaw !== "day" && shiftKeyRaw !== "night") {
      return NextResponse.json({ error: "Invalid shiftKey" }, { status: 400 });
    }
    if (authedUser.role !== "admin") {
      return NextResponse.json({ error: "Invalid shiftKey" }, { status: 403 });
    }
    const shiftWhere = await leadsCreatedByShiftWhere(shiftKeyRaw);
    if (shiftWhere) where = andWhereClause(where, shiftWhere);
  }

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    return NextResponse.json({ error: "fromDate and toDate must both be provided" }, { status: 400 });
  }
  if (fromDate && toDate && fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before or equal to toDate" }, { status: 400 });
  }

  const leadPhase = searchParams.get("leadPhase");
  if (leadPhase) {
    const allowed = new Set(["active", "closed", "cancelled"]);
    if (!allowed.has(leadPhase)) {
      return NextResponse.json({ error: "Invalid leadPhase" }, { status: 400 });
    }
  }

  if (fromDate && toDate) {
    const { clause, field, error } = resolveLeadListDateRange({
      fromDate,
      toDate,
      leadPhase,
      dateFieldRaw: searchParams.get("dateField"),
    });
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
    where = andWhereClause(where, clause);
  }

  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 25), 100);
  const offset = (page - 1) * pageSize;

  if (leadPhase) {
    where.leadPhase = leadPhase;
  }

  const leadContactTag = searchParams.get("leadContactTag");
  if (leadContactTag) {
    if (!LEAD_CONTACT_TAG_VALUES.has(leadContactTag)) {
      return NextResponse.json({ error: "Invalid leadContactTag" }, { status: 400 });
    }
    where.leadContactTag = leadContactTag;
  }

  const leadProgressTag = searchParams.get("leadProgressTag");
  if (leadProgressTag) {
    if (LEAD_PROGRESS_TAG_VALUES.has(leadProgressTag)) {
      where = andWhereClause(where, progressTagContainsLiteral(leadProgressTag));
    } else if (LEAD_PROGRESS_MISSING_VALUES.has(leadProgressTag)) {
      const spec = LEAD_PROGRESS_MISSING_FILTERS.find((f) => f.value === leadProgressTag);
      if (spec?.requiresProcessing) {
        where.leadProcessedRequired = true;
      }
      where = andWhereClause(where, progressTagMissingLiteral(spec.tagKey));
    } else {
      return NextResponse.json({ error: "Invalid leadProgressTag" }, { status: 400 });
    }
  }

  const q = String(searchParams.get("q") || "").trim();
  const searchByRaw = String(searchParams.get("searchBy") || "all").trim();
  const searchBy = SEARCH_BY_VALUES.has(searchByRaw) ? searchByRaw : "all";
  if (q) {
    const searchWhere = buildLeadSearchWhere(q, searchBy);
    if (searchWhere?.error) {
      return NextResponse.json({ error: searchWhere.error }, { status: 400 });
    }
    where = andWhereClause(where, searchWhere);
  }

  const stateRaw = String(searchParams.get("state") || "").trim().toUpperCase();
  if (stateRaw) {
    if (!getStateByCode(stateRaw)) {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }
    where.state = stateRaw;
  }

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
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

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

  await syncLeadCustomer(lead);

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
