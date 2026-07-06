import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { WORKFLOW_TAG_CATEGORIES } from "@/server/workflowTags/defaults";
import {
  invalidateWorkflowTagRegistry,
  serializeWorkflowTagRow,
} from "@/server/workflowTags/registry";

function trimLabel(value, maxLen) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

export async function PATCH(req, { params }) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid tag id" }, { status: 400 });
  }

  const row = await db.WorkflowTag.findByPk(id);
  if (!row) return NextResponse.json({ error: "Tag not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const update = {};

  if (body?.fullLabel !== undefined) {
    const fullLabel = trimLabel(body.fullLabel, 128);
    if (!fullLabel) return NextResponse.json({ error: "Full label is required" }, { status: 400 });
    update.fullLabel = fullLabel;
  }

  if (body?.shortLabel !== undefined) {
    const shortLabel = trimLabel(body.shortLabel, 32);
    if (!shortLabel) return NextResponse.json({ error: "Short label is required" }, { status: 400 });
    update.shortLabel = shortLabel;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  if (!WORKFLOW_TAG_CATEGORIES.has(row.category)) {
    return NextResponse.json({ error: "Invalid tag category" }, { status: 400 });
  }

  update.updatedByUserId = authedUser.id;
  await row.update(update);
  invalidateWorkflowTagRegistry();

  return NextResponse.json({ ok: true, tag: serializeWorkflowTagRow(row) });
}
