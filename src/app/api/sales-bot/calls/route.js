import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { requireSalesBotTrainer } from "@/server/auth/requireSalesBotTrainer";
import { dateRangeWhere } from "@/server/calls/aggregateMetrics";

export const runtime = "nodejs";

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

/** List Sales Bot call logs only (callKind / dialMode = sales_bot). */
export async function GET(req) {
  const { authedUser, errorResponse } = await requireSalesBotTrainer();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 20), 100);
  const offset = (page - 1) * pageSize;
  const fromDate = parseDateOnly(searchParams.get("fromDate"));
  const toDate = parseDateOnly(searchParams.get("toDate"));
  const view = String(searchParams.get("view") || "mine").trim().toLowerCase();
  const viewAll = view === "all" && authedUser.role === "admin";

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    return NextResponse.json({ error: "fromDate and toDate must both be provided" }, { status: 400 });
  }
  if (fromDate && toDate && fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before or equal to toDate" }, { status: 400 });
  }

  let where = {
    [Op.or]: [{ callKind: "sales_bot" }, { dialMode: "sales_bot" }],
  };
  if (!viewAll) {
    where = { [Op.and]: [where, { userId: authedUser.id }] };
  }
  if (fromDate && toDate) {
    Object.assign(where, dateRangeWhere(fromDate, toDate));
  }

  const { rows, count } = await db.CallLog.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    offset,
    limit: pageSize,
    distinct: true,
    col: "CallLog.id",
    attributes: [
      "id",
      "userId",
      "fromNumber",
      "toNumber",
      "direction",
      "status",
      "twilioSid",
      "customerCallSid",
      "agentDurationSeconds",
      "customerDurationSeconds",
      "durationSeconds",
      "recordingSid",
      "recordingStatus",
      "recordingDurationSeconds",
      "callKind",
      "dialMode",
      "answeredBy",
      "conferenceName",
      "contactName",
      "createdAt",
      "updatedAt",
    ],
    include:
      viewAll
        ? [
            {
              association: "user",
              attributes: ["id", "username"],
              required: false,
            },
          ]
        : [],
  });

  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  return NextResponse.json({
    calls: rows.map((call) => {
      const plain = call.toJSON ? call.toJSON() : call;
      return {
        id: plain.id,
        userId: plain.userId,
        username: plain.user?.username || null,
        fromNumber: plain.fromNumber,
        toNumber: plain.toNumber,
        direction: plain.direction,
        status: plain.status,
        durationSeconds: plain.durationSeconds ?? plain.customerDurationSeconds ?? null,
        agentDurationSeconds: plain.agentDurationSeconds ?? null,
        customerDurationSeconds: plain.customerDurationSeconds ?? null,
        recordingSid: plain.recordingSid || null,
        recordingStatus: plain.recordingStatus || null,
        recordingDurationSeconds: plain.recordingDurationSeconds ?? null,
        recordingUrl: plain.recordingSid ? `/api/calls/recording/download/${plain.id}` : null,
        callKind: plain.callKind || "sales_bot",
        dialMode: plain.dialMode || "sales_bot",
        answeredBy: plain.answeredBy || null,
        conferenceName: plain.conferenceName || null,
        contactName: plain.contactName || null,
        createdAt: plain.createdAt,
        updatedAt: plain.updatedAt,
      };
    }),
    pagination: {
      page,
      pageSize,
      total: count,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
}
