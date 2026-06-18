import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { shouldRedactLeadPhones } from "@/lib/maskPhone";
import { hasLeadMonitorAccess } from "@/lib/leadRoles";
import { canAccessLead, canAssignLeadToAgent } from "@/server/leads/leadAccess";
import { createLeadUpdate } from "@/server/leads/leadUpdates";
import { leadAssignedUserInclude, serializeLead } from "@/server/leads/serializeLead";

function trimField(value, maxLen) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

const ALLOWED_STATUSES = new Set(["new", "contacted", "callback", "qualified", "closed", "dnc"]);

export async function PATCH(req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const lead = await db.Lead.findByPk(id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!(await canAccessLead(lead, authedUser))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const update = {};
  const activity = [];

  if (shouldRedactLeadPhones(authedUser.role) && (body?.phone != null || body?.cellNumber !== undefined)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (body?.phone != null) {
    const phone = normalizeToE164(body.phone);
    if (!phone) return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    update.phone = phone;
  }
  if (body?.fullName != null) {
    const fullName = trimField(body.fullName, 128);
    if (!fullName) return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    update.fullName = fullName;
  }
  if (body?.cellNumber !== undefined) {
    const cellRaw = trimField(body.cellNumber, 32);
    if (!cellRaw) {
      update.cellNumber = null;
    } else {
      const cellNumber = normalizeToE164(cellRaw);
      if (!cellNumber) return NextResponse.json({ error: "Invalid cell number" }, { status: 400 });
      update.cellNumber = cellNumber;
    }
  }
  if (body?.company !== undefined) update.company = trimField(body.company, 255);
  if (body?.email !== undefined) update.email = trimField(body.email, 255);
  if (body?.city !== undefined) update.city = trimField(body.city, 128);
  if (body?.state !== undefined) update.state = trimField(body.state, 32);
  if (body?.zipCode !== undefined) update.zipCode = trimField(body.zipCode, 16);

  if (body?.notes !== undefined) {
    const nextNotes = trimField(body.notes, 65535);
    const prevNotes = lead.notes || "";
    if ((nextNotes || "") !== (prevNotes || "")) {
      update.notes = nextNotes;
      activity.push({
        type: "note_edit",
        body: nextNotes || "(cleared notes)",
      });
    }
  }

  if (body?.status != null) {
    const status = String(body.status).trim().toLowerCase();
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (status !== lead.status) {
      activity.push({
        type: "status_change",
        previousStatus: lead.status,
        newStatus: status,
        body: null,
      });
      update.status = status;
    }
  }

  if (body?.nextCallbackAt !== undefined) {
    if (body.nextCallbackAt === null || body.nextCallbackAt === "") {
      update.nextCallbackAt = null;
    } else {
      const d = new Date(body.nextCallbackAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid nextCallbackAt" }, { status: 400 });
      }
      update.nextCallbackAt = d;
    }
  }

  if (body?.assignedUserId != null && (hasLeadMonitorAccess(authedUser.role) || authedUser.role === "supervisor")) {
    const nextAssignee = Number(body.assignedUserId);
    if (!Number.isInteger(nextAssignee) || nextAssignee <= 0) {
      return NextResponse.json({ error: "Invalid assigned agent" }, { status: 400 });
    }
    if (!(await canAssignLeadToAgent(authedUser, nextAssignee))) {
      return NextResponse.json({ error: "Invalid assigned agent" }, { status: 400 });
    }
    if (nextAssignee !== lead.assignedUserId) {
      update.assignedUserId = nextAssignee;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await lead.update(update);

  for (const entry of activity) {
    await createLeadUpdate({
      leadId: lead.id,
      userId: authedUser.id,
      type: entry.type,
      body: entry.body,
      previousStatus: entry.previousStatus,
      newStatus: entry.newStatus,
    });
  }

  await lead.reload({
    include: [leadAssignedUserInclude],
  });
  return NextResponse.json({
    ok: true,
    lead: serializeLead(lead, null, authedUser.role),
  });
}
