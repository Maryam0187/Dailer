import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import db from "@/server/db";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { dateRangeWhereOn } from "@/server/calls/aggregateMetrics";
import { andWhereClause, resolveLeadsListWhere } from "@/server/leads/leadAccess";
import { leadListIncludes } from "@/server/leads/serializeLead";
import { LEAD_CONTACT_TAG_VALUES } from "@/lib/leadWorkflow";
import { getStateByCode } from "@/lib/usStates";
import { formatLeadService } from "@/lib/leadService";
import { stripHtml } from "@/lib/richText";
import { Op } from "sequelize";

const MAX_EXPORT_ROWS = 5000;

function parseDateOnly(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function resolveDateField(leadPhase, dateFieldRaw) {
  const raw = String(dateFieldRaw || "").trim().toLowerCase();
  if (raw === "created" || raw === "createdat") return "createdAt";
  if (raw === "updated" || raw === "updatedat") return "updatedAt";
  if (leadPhase === "closed" || leadPhase === "cancelled") return "updatedAt";
  return "createdAt";
}

function formatIsoDate(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

export async function GET(req) {
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

  if (authedUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const fromDate = parseDateOnly(searchParams.get("fromDate"));
  const toDate = parseDateOnly(searchParams.get("toDate"));

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    return NextResponse.json({ error: "fromDate and toDate must both be provided" }, { status: 400 });
  }
  if (fromDate && toDate && fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before or equal to toDate" }, { status: 400 });
  }

  const agentIdRaw = searchParams.get("agentId");
  const supervisorIdRaw = searchParams.get("supervisorId");
  const creatorId = agentIdRaw ? Number(agentIdRaw) : null;
  const supervisorId = supervisorIdRaw ? Number(supervisorIdRaw) : null;

  if (agentIdRaw && (!Number.isInteger(creatorId) || creatorId <= 0)) {
    return NextResponse.json({ error: "Invalid agentId" }, { status: 400 });
  }
  if (supervisorIdRaw && (!Number.isInteger(supervisorId) || supervisorId <= 0)) {
    return NextResponse.json({ error: "Invalid supervisorId" }, { status: 400 });
  }

  let where = await resolveLeadsListWhere(authedUser, {
    sharedAll: true,
    creatorId,
    supervisorId,
  });

  const leadPhase = searchParams.get("leadPhase");
  if (leadPhase) {
    const allowed = new Set(["active", "closed", "cancelled"]);
    if (!allowed.has(leadPhase)) {
      return NextResponse.json({ error: "Invalid leadPhase" }, { status: 400 });
    }
    where = andWhereClause(where, { leadPhase });
  }

  if (fromDate && toDate) {
    const field = resolveDateField(leadPhase, searchParams.get("dateField"));
    where = andWhereClause(where, dateRangeWhereOn(field, fromDate, toDate));
  }

  const leadContactTag = searchParams.get("leadContactTag");
  if (leadContactTag) {
    if (!LEAD_CONTACT_TAG_VALUES.has(leadContactTag)) {
      return NextResponse.json({ error: "Invalid leadContactTag" }, { status: 400 });
    }
    where = andWhereClause(where, { leadContactTag });
  }

  const stateRaw = String(searchParams.get("state") || "").trim().toUpperCase();
  if (stateRaw) {
    if (!getStateByCode(stateRaw)) {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }
    where = andWhereClause(where, { state: stateRaw });
  }

  const q = String(searchParams.get("q") || "").trim();
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

  const leads = await db.Lead.findAll({
    where,
    include: leadListIncludes,
    order: [
      ["updatedAt", "DESC"],
      ["id", "DESC"],
    ],
    limit: MAX_EXPORT_ROWS,
  });

  const rows = leads.map((lead) => ({
    ID: lead.id,
    Name: lead.fullName || "",
    Phone: lead.phone || "",
    Cell: lead.cellNumber || "",
    Email: lead.email || "",
    Company: lead.company || "",
    City: lead.city || "",
    State: lead.state || "",
    Zip: lead.zipCode || "",
    Service: formatLeadService(lead),
    Status: lead.leadPhase || "",
    "Sale created": formatIsoDate(lead.createdAt),
    "Last updated": formatIsoDate(lead.updatedAt),
    "Lead notes": stripHtml(lead.notes || ""),
    "Breakdown notes": stripHtml(lead.breakdown || ""),
    "Cancel notes": lead.leadCancelReason || "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Shared leads");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `shared-leads_${stamp}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
