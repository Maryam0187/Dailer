import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { createLeadUpdate } from "@/server/leads/leadUpdates";
import { buildLeadsListWhere, canAssignLeadToAgent, canFilterLeadsBySupervisor, getSupervisorTeamUserIds } from "@/server/leads/leadAccess";
import { leadAssignedUserInclude, serializeLead } from "@/server/leads/serializeLead";

function trimField(value, maxLen) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const where = await buildLeadsListWhere(authedUser);

  const { searchParams } = new URL(req.url);
  const agentIdRaw = searchParams.get("agentId");
  const supervisorIdRaw = searchParams.get("supervisorId");
  const agentId = agentIdRaw ? Number(agentIdRaw) : null;
  const supervisorId = supervisorIdRaw ? Number(supervisorIdRaw) : null;

  if (agentIdRaw && (!Number.isInteger(agentId) || agentId <= 0)) {
    return NextResponse.json({ error: "Invalid agentId" }, { status: 400 });
  }
  if (supervisorIdRaw && (!Number.isInteger(supervisorId) || supervisorId <= 0)) {
    return NextResponse.json({ error: "Invalid supervisorId" }, { status: 400 });
  }

  if (supervisorId) {
    if (!(await canFilterLeadsBySupervisor(authedUser, supervisorId))) {
      return NextResponse.json({ error: "Invalid supervisorId" }, { status: 403 });
    }
    const teamUserIds = await getSupervisorTeamUserIds(supervisorId);
    if (teamUserIds.length === 0) {
      where.assignedUserId = -1;
    } else if (agentId) {
      if (!teamUserIds.includes(agentId)) {
        return NextResponse.json({ error: "Invalid agentId for supervisor" }, { status: 403 });
      }
      if (!(await canAssignLeadToAgent(authedUser, agentId))) {
        return NextResponse.json({ error: "Invalid agentId" }, { status: 403 });
      }
      where.assignedUserId = agentId;
    } else {
      where.assignedUserId = { [Op.in]: teamUserIds };
    }
  } else if (agentId) {
    if (!(await canAssignLeadToAgent(authedUser, agentId))) {
      return NextResponse.json({ error: "Invalid agentId" }, { status: 403 });
    }
    where.assignedUserId = agentId;
  }

  const leads = await db.Lead.findAll({
    where,
    order: [
      ["nextCallbackAt", "ASC"],
      ["updatedAt", "DESC"],
    ],
    include: [leadAssignedUserInclude],
  });

  const leadIds = leads.map((l) => l.id);
  const lastCalls = new Map();
  if (leadIds.length > 0) {
    const rows = await db.CallLog.findAll({
      where: { leadId: leadIds },
      attributes: ["leadId", "createdAt"],
      order: [["createdAt", "DESC"]],
      raw: true,
    });
    for (const row of rows) {
      if (!lastCalls.has(row.leadId)) lastCalls.set(row.leadId, row.createdAt);
    }
  }

  return NextResponse.json({
    leads: leads.map((l) => serializeLead(l, lastCalls.get(l.id) || null)),
  });
}

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const phone = normalizeToE164(body?.phone);
  const firstName = trimField(body?.firstName, 128);

  if (!phone) {
    return NextResponse.json({ error: "Valid phone is required" }, { status: 400 });
  }
  if (!firstName) {
    return NextResponse.json({ error: "First name is required" }, { status: 400 });
  }

  const callLogId = Number(body?.createdFromCallLogId);
  let createdFromCallLogId = null;
  if (Number.isInteger(callLogId) && callLogId > 0) {
    const call = await db.CallLog.findByPk(callLogId);
    if (call && (call.userId === authedUser.id || authedUser.role === "admin")) {
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
  if (authedUser.role === "admin" || authedUser.role === "supervisor") {
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
    firstName,
    lastName: trimField(body?.lastName, 128),
    company: trimField(body?.company, 255),
    email: trimField(body?.email, 255),
    city: trimField(body?.city, 128),
    state: trimField(body?.state, 32),
    zipCode: trimField(body?.zipCode, 16),
    notes: trimField(body?.notes, 65535),
    status: "new",
    source,
    nextCallbackAt,
    assignedUserId,
    createdByUserId: authedUser.id,
    createdFromCallLogId,
  });

  const withUser = await db.Lead.findByPk(lead.id, {
    include: [leadAssignedUserInclude],
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

  return NextResponse.json({ ok: true, lead: serializeLead(withUser) }, { status: 201 });
}
