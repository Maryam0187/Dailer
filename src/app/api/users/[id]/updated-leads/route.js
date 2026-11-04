import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canViewTargetCalls } from "@/server/auth/userAccess";
import { dateRangeWhere } from "@/server/calls/aggregateMetrics";
import {
  andWhereClause,
  excludeOutsideSaleWhere,
  excludePendingLegacyImportWhere,
} from "@/server/leads/leadAccess";
import { leadListIncludes, serializeLead } from "@/server/leads/serializeLead";

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

/**
 * Leads this user edited in the range. Uses LeadUpdates.userId, not Lead.updatedAt,
 * so another person's save does not show up on this user's report.
 */
export async function GET(req, { params }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const target = await db.User.findByPk(id, {
    attributes: ["id", "role", "managerId", "supervisorId", "isOutside", "shiftKey"],
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await canViewTargetCalls(authedUser, target);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 100), 100);
  const fromDate = parseDateOnly(searchParams.get("fromDate"));
  const toDate = parseDateOnly(searchParams.get("toDate"));

  if (!fromDate || !toDate) {
    return NextResponse.json({ error: "fromDate and toDate are required" }, { status: 400 });
  }
  if (fromDate > toDate) {
    return NextResponse.json(
      { error: "fromDate must be before or equal to toDate" },
      { status: 400 },
    );
  }

  const { fn, col } = db.sequelize;
  const updateRows = await db.LeadUpdate.findAll({
    attributes: ["leadId", [fn("MAX", col("createdAt")), "lastUpdateAt"]],
    where: {
      userId: target.id,
      type: { [Op.ne]: "created" },
      ...dateRangeWhere(fromDate, toDate),
    },
    group: ["leadId"],
    order: [[fn("MAX", col("createdAt")), "DESC"]],
    limit: pageSize,
    raw: true,
    subQuery: false,
  });

  const leadIds = updateRows
    .map((row) => Number(row.leadId))
    .filter((leadId) => Number.isInteger(leadId) && leadId > 0);

  if (leadIds.length === 0) {
    return NextResponse.json({ leads: [] });
  }

  const where = andWhereClause(
    andWhereClause({ id: { [Op.in]: leadIds } }, excludeOutsideSaleWhere()),
    await excludePendingLegacyImportWhere(),
  );

  const leads = await db.Lead.findAll({
    where,
    include: leadListIncludes,
  });
  const byId = new Map(leads.map((lead) => [lead.id, lead]));
  const ordered = leadIds.map((leadId) => byId.get(leadId)).filter(Boolean);

  return NextResponse.json({
    leads: ordered.map((lead) => serializeLead(lead, null, authedUser.role, authedUser.id)),
  });
}
