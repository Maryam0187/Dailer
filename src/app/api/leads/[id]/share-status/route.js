import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { canAccessLead } from "@/server/leads/leadAccess";
import { createLeadUpdate } from "@/server/leads/leadUpdates";
import { logLeadUserActivity } from "@/server/activity/logLeadActivity";
import { leadListIncludes, serializeLead } from "@/server/leads/serializeLead";
import {
  MANUAL_SHARE_VIEWER_STATUS_VALUES,
  shareViewerStatusLabel,
} from "@/lib/shareViewerStatus";
import { getWorkflowTagRegistry, workflowTagFullLabel } from "@/server/workflowTags/registry";

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

  const isShareUser = Number(lead.sharedViewerUserId) === Number(authedUser.id);
  if (authedUser.role !== "admin" && !isShareUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (lead.sharedViewerUserId == null) {
    return NextResponse.json({ error: "Lead is not shared" }, { status: 400 });
  }
  if (lead.sharedViewerStatus === "lead_created" || lead.sharedCreatedLeadId) {
    return NextResponse.json(
      { error: "Share status is locked because a lead was created from this share" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  const next = String(body?.sharedViewerStatus || "").trim();
  if (!MANUAL_SHARE_VIEWER_STATUS_VALUES.has(next)) {
    return NextResponse.json({ error: "Invalid sharedViewerStatus" }, { status: 400 });
  }

  if (next !== lead.sharedViewerStatus) {
    await lead.update({ sharedViewerStatus: next }, { silent: true });
    const registry = await getWorkflowTagRegistry();
    const label = workflowTagFullLabel(registry, "share", next, shareViewerStatusLabel(next));
    await createLeadUpdate({
      leadId: lead.id,
      userId: authedUser.id,
      type: "lead_edit",
      body: `Share status: ${label}`,
    });
    await logLeadUserActivity({
      req,
      userId: authedUser.id,
      action: "lead_shared_view",
      leadId: lead.id,
      metadata: {
        leadName: lead.fullName || null,
        summary: `Share status: ${label}`,
        sharedViewerStatus: next,
      },
    });
  }

  await lead.reload({ include: leadListIncludes });
  return NextResponse.json({
    ok: true,
    lead: serializeLead(lead, null, authedUser.role, authedUser.id),
  });
}
