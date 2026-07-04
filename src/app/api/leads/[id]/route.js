import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { shouldRedactLeadPhones } from "@/lib/maskPhone";
import { hasLeadMonitorAccess } from "@/lib/leadRoles";
import { canAccessLead, canAssignLeadToAgent } from "@/server/leads/leadAccess";
import { createLeadUpdate } from "@/server/leads/leadUpdates";
import { buildLeadEditActivityBody } from "@/server/leads/buildLeadEditActivity";
import { logLeadUpdateActivity, logLeadUserActivity } from "@/server/activity/logLeadActivity";
import { applyLeadWorkflowPatch } from "@/server/leads/applyLeadWorkflowPatch";
import { hasLeadWorkflowPatch } from "@/lib/leadWorkflow";
import { leadListIncludes, serializeLead } from "@/server/leads/serializeLead";

function trimField(value, maxLen) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

const ALLOWED_STATUSES = new Set(["new", "contacted", "callback", "qualified", "closed", "dnc"]);
const ALLOWED_SERVICE_TYPES = new Set(["dish", "direct", "cable", "streams"]);

export async function PATCH(req, { params }) {
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

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

  if (body?.serviceType !== undefined) {
    if (body.serviceType === null || body.serviceType === "") {
      update.serviceType = null;
    } else {
      const serviceType = String(body.serviceType).trim().toLowerCase();
      if (!ALLOWED_SERVICE_TYPES.has(serviceType)) {
        return NextResponse.json({ error: "Invalid service type" }, { status: 400 });
      }
      update.serviceType = serviceType;
    }
  }

  const effectiveServiceType =
    update.serviceType !== undefined ? update.serviceType : lead.serviceType;

  if (body?.cableName !== undefined || (update.serviceType !== undefined && effectiveServiceType !== "cable")) {
    update.cableName =
      effectiveServiceType === "cable" ? trimField(body?.cableName ?? lead.cableName, 128) : null;
  }
  if (body?.streamName !== undefined || (update.serviceType !== undefined && effectiveServiceType !== "streams")) {
    update.streamName =
      effectiveServiceType === "streams" ? trimField(body?.streamName ?? lead.streamName, 128) : null;
  }

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

  if (body?.breakdown !== undefined) {
    const nextBreakdown = trimField(body.breakdown, 65535);
    const prevBreakdown = lead.breakdown || "";
    if ((nextBreakdown || "") !== (prevBreakdown || "")) {
      update.breakdown = nextBreakdown;
      activity.push({
        type: "breakdown_edit",
        body: nextBreakdown || "(cleared breakdown)",
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
      activity.push({
        type: "assigned",
        body: `Assigned to user #${nextAssignee}`,
        assignedUserId: nextAssignee,
        previousAssignedUserId: lead.assignedUserId,
      });
    }
  }

  if (hasLeadWorkflowPatch(body)) {
    const { update: workflowUpdate, activity: workflowActivity, errors } = applyLeadWorkflowPatch(lead, body);
    if (errors.length) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }
    Object.assign(update, workflowUpdate);
    activity.push(...workflowActivity);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const leadEditBody = buildLeadEditActivityBody(lead, update);
  if (leadEditBody) {
    activity.push({
      type: "lead_edit",
      body: leadEditBody,
    });
  }

  await lead.update(update);

  const leadName = update.fullName ?? lead.fullName;

  for (const entry of activity) {
    await createLeadUpdate({
      leadId: lead.id,
      userId: authedUser.id,
      type: entry.type === "assigned" ? "lead_edit" : entry.type,
      body: entry.body,
      previousStatus: entry.previousStatus,
      newStatus: entry.newStatus,
    });

    if (entry.type === "assigned") {
      await logLeadUserActivity({
        req,
        userId: authedUser.id,
        action: "lead_assigned",
        leadId: lead.id,
        metadata: {
          leadName,
          assignedUserId: entry.assignedUserId,
          previousAssignedUserId: entry.previousAssignedUserId,
        },
      });
    } else {
      await logLeadUpdateActivity({
        req,
        userId: authedUser.id,
        leadId: lead.id,
        leadName,
        entry,
      });
    }
  }

  await lead.reload({
    include: leadListIncludes,
  });
  return NextResponse.json({
    ok: true,
    lead: serializeLead(lead, null, authedUser.role),
  });
}
