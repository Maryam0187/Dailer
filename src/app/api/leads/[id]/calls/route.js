import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { maskPhoneLastFour, shouldRedactLeadPhones } from "@/lib/maskPhone";
import { hasLeadMonitorAccess } from "@/lib/leadRoles";
import { canAccessLead } from "@/server/leads/leadAccess";

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

export async function GET(req, { params }) {
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const leadId = Number(rawId);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const lead = await db.Lead.findByPk(leadId);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!(await canAccessLead(lead, authedUser))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 20), 50);
  const offset = (page - 1) * pageSize;
  const canSeeAllRecordings = hasLeadMonitorAccess(authedUser.role);
  const phonesRedacted = shouldRedactLeadPhones(authedUser.role);

  const { rows, count } = await db.CallLog.findAndCountAll({
    where: { leadId },
    order: [["createdAt", "DESC"]],
    offset,
    limit: pageSize,
    attributes: [
      "id",
      "userId",
      "toNumber",
      "status",
      "durationSeconds",
      "agentDurationSeconds",
      "customerDurationSeconds",
      "recordingSid",
      "recordingStatus",
      "disposition",
      "createdAt",
    ],
    include: [
      {
        model: db.User,
        as: "user",
        attributes: ["id", "username"],
        required: false,
      },
    ],
  });

  return NextResponse.json({
    calls: rows.map((call) => {
      const canSeeRecording = canSeeAllRecordings || call.userId === authedUser.id;
      return {
        id: call.id,
        userId: call.userId,
        agentName: call.user?.username || "—",
        toNumber: phonesRedacted ? maskPhoneLastFour(call.toNumber) : call.toNumber,
        status: call.status,
        durationSeconds: call.durationSeconds,
        agentDurationSeconds: call.agentDurationSeconds,
        customerDurationSeconds: call.customerDurationSeconds,
        disposition: call.disposition || null,
        recordingDownloadUrl:
          canSeeRecording && call.recordingSid ? `/api/calls/recording/download/${call.id}` : null,
        createdAt: call.createdAt,
      };
    }),
    pagination: {
      page,
      pageSize,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / pageSize)),
      hasNext: offset + rows.length < count,
      hasPrev: page > 1,
    },
  });
}
