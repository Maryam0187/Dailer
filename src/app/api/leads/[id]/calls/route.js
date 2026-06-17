import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canAccessLead } from "@/server/leads/leadAccess";

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

export async function GET(req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: rawId } = await params;
  const leadId = Number(rawId);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const lead = await db.Lead.findByPk(leadId);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!canAccessLead(lead, authedUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 20), 50);
  const offset = (page - 1) * pageSize;
  const isAdmin = authedUser.role === "admin";

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
      const canSeeRecording = isAdmin || call.userId === authedUser.id;
      return {
        id: call.id,
        userId: call.userId,
        agentName: call.user?.username || "—",
        toNumber: call.toNumber,
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
