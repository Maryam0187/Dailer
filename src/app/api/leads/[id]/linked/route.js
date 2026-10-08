import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { isViewOnlySharedViewer } from "@/lib/leadRoles";
import { canAccessLead } from "@/server/leads/leadAccess";
import { findLinkedLeadsForLead } from "@/server/leads/linkedLeads";

export async function GET(_req, { params }) {
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const lead = await db.Lead.findByPk(id, {
    attributes: [
      "id",
      "phone",
      "cellNumber",
      "assignedUserId",
      "createdByUserId",
      "processorUserId",
      "sharedViewerUserId",
      "source",
    ],
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!(await canAccessLead(lead, authedUser))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (isViewOnlySharedViewer(lead, authedUser.role, authedUser.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const leads = await findLinkedLeadsForLead(lead, authedUser);
  return NextResponse.json({ leads, count: leads.length });
}
