import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canAccessLead } from "@/server/leads/leadAccess";
import { createLeadUpdate, fetchLeadUpdates } from "@/server/leads/leadUpdates";
import { logLeadUserActivity } from "@/server/activity/logLeadActivity";

export async function GET(req, { params }) {
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

  const updates = await fetchLeadUpdates(id);
  return NextResponse.json({ updates });
}

export async function POST(req, { params }) {
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

  const rows = await fetchLeadUpdates(id);
  const created = rows.find((u) => u.id === update.id) || rows[0];
  return NextResponse.json({ ok: true, update: created }, { status: 201 });
}
