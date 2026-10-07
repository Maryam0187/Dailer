import { NextResponse } from "next/server";
import { Op } from "sequelize";
import { randomUUID } from "crypto";
import db from "@/server/db";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { dateRangeWhereOn } from "@/server/calls/aggregateMetrics";
import { andWhereClause, resolveLeadsListWhere } from "@/server/leads/leadAccess";
import { applySharedViewerChange } from "@/server/leads/applySharedViewer";
import { LEAD_CONTACT_TAG_VALUES } from "@/lib/leadWorkflow";
import { getStateByCode } from "@/lib/usStates";

const MAX_SELECTED = 200;
const MAX_REVOKE_ALL = 5000;

function parseDateOnly(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function resolveDateField(leadPhase, dateFieldRaw) {
  const raw = String(dateFieldRaw || "").trim().toLowerCase();
  if (raw === "created" || raw === "createdat") return "createdAt";
  if (raw === "updated" || raw === "updatedat") return "updatedAt";
  if (raw === "shared" || raw === "sharedviewerat") return "sharedViewerAt";
  if (leadPhase === "closed" || leadPhase === "cancelled") return "updatedAt";
  return "createdAt";
}

async function buildSharedWhere(authedUser, body) {
  const agentIdRaw = body?.agentId;
  const supervisorIdRaw = body?.supervisorId;
  const creatorId = agentIdRaw != null && agentIdRaw !== "" ? Number(agentIdRaw) : null;
  const supervisorId =
    supervisorIdRaw != null && supervisorIdRaw !== "" ? Number(supervisorIdRaw) : null;

  if (agentIdRaw != null && agentIdRaw !== "" && (!Number.isInteger(creatorId) || creatorId <= 0)) {
    return { error: "Invalid agentId" };
  }
  if (
    supervisorIdRaw != null &&
    supervisorIdRaw !== "" &&
    (!Number.isInteger(supervisorId) || supervisorId <= 0)
  ) {
    return { error: "Invalid supervisorId" };
  }

  let where = await resolveLeadsListWhere(authedUser, {
    sharedAll: true,
    creatorId,
    supervisorId,
  });

  const leadPhase = body?.leadPhase ? String(body.leadPhase) : null;
  if (leadPhase) {
    const allowed = new Set(["active", "closed", "cancelled"]);
    if (!allowed.has(leadPhase)) return { error: "Invalid leadPhase" };
    where = andWhereClause(where, { leadPhase });
  }

  const fromDate = parseDateOnly(body?.fromDate);
  const toDate = parseDateOnly(body?.toDate);
  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    return { error: "fromDate and toDate must both be provided" };
  }
  if (fromDate && toDate && fromDate > toDate) {
    return { error: "fromDate must be before or equal to toDate" };
  }
  if (fromDate && toDate) {
    const field = resolveDateField(leadPhase, body?.dateField);
    where = andWhereClause(where, dateRangeWhereOn(field, fromDate, toDate));
  }

  const leadContactTag = body?.leadContactTag ? String(body.leadContactTag) : null;
  if (leadContactTag) {
    if (!LEAD_CONTACT_TAG_VALUES.has(leadContactTag)) {
      return { error: "Invalid leadContactTag" };
    }
    where = andWhereClause(where, { leadContactTag });
  }

  const stateRaw = String(body?.state || "").trim().toUpperCase();
  if (stateRaw) {
    if (!getStateByCode(stateRaw)) return { error: "Invalid state" };
    where = andWhereClause(where, { state: stateRaw });
  }

  const q = String(body?.q || "").trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
    where = andWhereClause(where, {
      [Op.or]: [
        { fullName: { [Op.like]: like } },
        { phone: { [Op.like]: like } },
        { cellNumber: { [Op.like]: like } },
      ],
    });
  }

  return { where };
}

export async function POST(req) {
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

  if (authedUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const revokeAll = body?.revokeAll === true;

  let leadIds = [];
  if (revokeAll) {
    const built = await buildSharedWhere(authedUser, body || {});
    if (built.error) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }
    const rows = await db.Lead.findAll({
      where: built.where,
      attributes: ["id"],
      limit: MAX_REVOKE_ALL + 1,
    });
    if (rows.length > MAX_REVOKE_ALL) {
      return NextResponse.json(
        { error: `Too many shared leads to revoke at once (max ${MAX_REVOKE_ALL}). Narrow filters.` },
        { status: 400 },
      );
    }
    leadIds = rows.map((r) => r.id);
  } else {
    const rawIds = Array.isArray(body?.leadIds) ? body.leadIds : [];
    leadIds = [
      ...new Set(
        rawIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    if (leadIds.length === 0) {
      return NextResponse.json({ error: "No leads selected" }, { status: 400 });
    }
    if (leadIds.length > MAX_SELECTED) {
      return NextResponse.json(
        { error: `You can revoke at most ${MAX_SELECTED} leads at once` },
        { status: 400 },
      );
    }
  }

  if (leadIds.length === 0) {
    return NextResponse.json({
      ok: true,
      batchId: null,
      updatedCount: 0,
      skippedCount: 0,
      missingCount: 0,
      failedCount: 0,
      updated: [],
      skipped: [],
      missing: [],
      failed: [],
    });
  }

  const leads = await db.Lead.findAll({
    where: {
      id: { [Op.in]: leadIds },
      sharedViewerUserId: { [Op.ne]: null },
    },
    attributes: ["id", "fullName", "sharedViewerUserId"],
  });
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  const previousIds = [
    ...new Set(leads.map((lead) => lead.sharedViewerUserId).filter((id) => id != null)),
  ];
  const users =
    previousIds.length > 0
      ? await db.User.findAll({
          where: { id: { [Op.in]: previousIds } },
          attributes: ["id", "username"],
        })
      : [];
  const usernameById = new Map(users.map((u) => [u.id, u.username]));

  const batchId = randomUUID();
  const updated = [];
  const skipped = [];
  const missing = [];
  const failed = [];

  for (const id of leadIds) {
    const lead = leadById.get(id);
    if (!lead) {
      // Not found or already not shared
      if (revokeAll) skipped.push(id);
      else missing.push(id);
      continue;
    }
    try {
      const result = await applySharedViewerChange({
        lead,
        nextViewerId: null,
        actorUserId: authedUser.id,
        req,
        usernameById,
        metadataExtra: { bulk: true, revoke: true, revokeAll, batchId },
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
    revokeAll,
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
