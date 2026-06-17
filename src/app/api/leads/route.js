import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { createLeadUpdate } from "@/server/leads/leadUpdates";

function trimField(value, maxLen) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function serializeLead(lead, lastCallAt = null) {
  return {
    id: lead.id,
    phone: lead.phone,
    firstName: lead.firstName,
    lastName: lead.lastName,
    company: lead.company,
    email: lead.email,
    city: lead.city,
    state: lead.state,
    zipCode: lead.zipCode,
    notes: lead.notes,
    status: lead.status,
    source: lead.source,
    nextCallbackAt: lead.nextCallbackAt,
    assignedUserId: lead.assignedUserId,
    createdByUserId: lead.createdByUserId,
    createdFromCallLogId: lead.createdFromCallLogId,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    lastCallAt,
  };
}

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = authedUser.role;
  let where = {};
  if (role === "agent") {
    where = {
      [Op.or]: [{ assignedUserId: authedUser.id }, { createdByUserId: authedUser.id }],
    };
  }

  const leads = await db.Lead.findAll({
    where,
    order: [
      ["nextCallbackAt", "ASC"],
      ["updatedAt", "DESC"],
    ],
    include: [
      { model: db.User, as: "assignedUser", attributes: ["id", "username"], required: false },
    ],
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
    assignedUserId: authedUser.id,
    createdByUserId: authedUser.id,
    createdFromCallLogId,
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

  return NextResponse.json({ ok: true, lead: serializeLead(lead) }, { status: 201 });
}
