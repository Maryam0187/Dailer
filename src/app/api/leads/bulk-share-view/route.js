import { NextResponse } from "next/server";
import { Op } from "sequelize";
import { randomUUID } from "crypto";
import db from "@/server/db";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { canAssignSharedViewer } from "@/server/leads/leadAccess";
import { applySharedViewerChange } from "@/server/leads/applySharedViewer";

const MAX_BULK = 200;

export async function POST(req) {
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

  if (authedUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rawIds = Array.isArray(body?.leadIds) ? body.leadIds : [];
  const leadIds = [
    ...new Set(
      rawIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  if (leadIds.length === 0) {
    return NextResponse.json({ error: "No leads selected" }, { status: 400 });
  }
  if (leadIds.length > MAX_BULK) {
    return NextResponse.json(
      { error: `You can share at most ${MAX_BULK} leads at once` },
      { status: 400 },
    );
  }

  let nextViewerId = null;
  if (body?.sharedViewerUserId !== null && body?.sharedViewerUserId !== undefined && body?.sharedViewerUserId !== "") {
    nextViewerId = Number(body.sharedViewerUserId);
    if (!Number.isInteger(nextViewerId) || nextViewerId <= 0) {
      return NextResponse.json({ error: "Invalid shared viewer" }, { status: 400 });
    }
    if (!(await canAssignSharedViewer(authedUser, nextViewerId))) {
      return NextResponse.json({ error: "Invalid shared viewer" }, { status: 400 });
    }
  }

  const leads = await db.Lead.findAll({
    where: { id: { [Op.in]: leadIds } },
    attributes: ["id", "fullName", "sharedViewerUserId"],
  });
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  const previousIds = [
    ...new Set(leads.map((lead) => lead.sharedViewerUserId).filter((id) => id != null)),
  ];
  const lookupIds = [...new Set([...(nextViewerId != null ? [nextViewerId] : []), ...previousIds])];
  const users =
    lookupIds.length > 0
      ? await db.User.findAll({
          where: { id: { [Op.in]: lookupIds } },
          attributes: ["id", "username"],
        })
      : [];
  const usernameById = new Map(users.map((u) => [u.id, u.username]));
  const sharedViewerUsername =
    nextViewerId != null ? usernameById.get(nextViewerId) ?? null : null;

  const batchId = randomUUID();
  const updated = [];
  const skipped = [];
  const missing = [];
  const failed = [];

  for (const id of leadIds) {
    const lead = leadById.get(id);
    if (!lead) {
      missing.push(id);
      continue;
    }
    try {
      const result = await applySharedViewerChange({
        lead,
        nextViewerId,
        actorUserId: authedUser.id,
        req,
        usernameById,
        metadataExtra: { bulk: true, batchId },
      });
      if (result.changed) updated.push(id);
      else skipped.push(id);
    } catch {
      failed.push(id);
    }
  }

  return NextResponse.json({
    ok: true,
    batchId,
    sharedViewerUserId: nextViewerId,
    sharedViewerUsername,
    updatedCount: updated.length,
    skippedCount: skipped.length,
    missingCount: missing.length,
    failedCount: failed.length,
    updated,
    skipped,
    missing,
    failed,
  });
}
