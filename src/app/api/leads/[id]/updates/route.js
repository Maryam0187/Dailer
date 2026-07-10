import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { canAccessLead } from "@/server/leads/leadAccess";
import {
  createLeadUpdate,
  fetchLeadUpdates,
  filterLeadUpdatesForViewer,
} from "@/server/leads/leadUpdates";
import { logLeadUserActivity } from "@/server/activity/logLeadActivity";

export async function GET(req, { params }) {
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

  const updates = filterLeadUpdatesForViewer(await fetchLeadUpdates(id), authedUser, lead);
  return NextResponse.json({ updates });
}

export async function POST(req, { params }) {
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
  const comment = String(body?.comment || body?.body || "").trim();
  if (!comment) {
    return NextResponse.json({ error: "Comment is required" }, { status: 400 });
  }

  const update = await createLeadUpdate({
    leadId: id,
    userId: authedUser.id,
    type: "comment",
    body: comment.slice(0, 65535),
  });

  await logLeadUserActivity({
    req,
    userId: authedUser.id,
    action: "lead_comment",
    leadId: id,
    metadata: {
      leadName: lead.fullName,
      summary: comment.length > 200 ? `${comment.slice(0, 197)}…` : comment,
    },
  });

  const rows = filterLeadUpdatesForViewer(await fetchLeadUpdates(id), authedUser, lead);
  const created = rows.find((u) => u.id === update.id) || rows[0];
  return NextResponse.json({ ok: true, update: created }, { status: 201 });
}
