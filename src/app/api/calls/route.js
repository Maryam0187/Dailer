import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { applyCallKindToWhere, parseCallScope } from "@/server/calls/callKindFilter";

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

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 20), 100);
  const offset = (page - 1) * pageSize;
  const fromDate = parseDateOnly(searchParams.get("fromDate"));
  const toDate = parseDateOnly(searchParams.get("toDate"));
  /** `all` | `cold` | `lead` | `conference` */
  const scope = String(searchParams.get("scope") || "all").trim().toLowerCase();
  const { kind: callKindFilter, conferenceOnly } = parseCallScope(scope);
  /** Admin-only: `view=all` returns every user's call logs on the home page. */
  const view = String(searchParams.get("view") || "mine").trim().toLowerCase();
  const viewAll = view === "all" && authedUser.role === "admin";

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    return NextResponse.json({ error: "fromDate and toDate must both be provided" }, { status: 400 });
  }
  if (fromDate && toDate && fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before or equal to toDate" }, { status: 400 });
  }

  // Home page lists only the signed-in user's own calls unless admin passes view=all.
  // For conference scope, also include calls where this user was invited as an agent.
  let where;
  if (viewAll) {
    if (conferenceOnly) {
      const confRows = await db.InviteDialLeg.findAll({
        attributes: ["callLogId"],
        group: ["callLogId"],
        raw: true,
      });
      const conferenceCallIds = confRows
        .map((r) => r.callLogId)
        .filter((id) => Number.isInteger(id));

      if (conferenceCallIds.length === 0) {
        return NextResponse.json({
          calls: [],
          pagination: {
            page,
            pageSize,
            total: 0,
            totalPages: 1,
            hasNext: false,
            hasPrev: page > 1,
          },
        });
      }

      where = { id: { [Op.in]: conferenceCallIds } };
    } else {
      where = {};
    }
  } else if (conferenceOnly) {
    const ownedConfRows = await db.InviteDialLeg.findAll({
      attributes: ["callLogId"],
      group: ["callLogId"],
      raw: true,
    });
    const conferenceCallIds = ownedConfRows
      .map((r) => r.callLogId)
      .filter((id) => Number.isInteger(id));

    const invitedRows = await db.InviteDialLeg.findAll({
      where: { invitedUserId: authedUser.id },
      attributes: ["callLogId"],
      group: ["callLogId"],
      raw: true,
    });
    const invitedCallIds = invitedRows
      .map((r) => r.callLogId)
      .filter((id) => Number.isInteger(id));

    if (conferenceCallIds.length === 0 && invitedCallIds.length === 0) {
      return NextResponse.json({
        calls: [],
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: page > 1,
        },
      });
    }

    where = {
      [Op.or]: [
        ...(conferenceCallIds.length > 0
          ? [{ [Op.and]: [{ userId: authedUser.id }, { id: { [Op.in]: conferenceCallIds } }] }]
          : []),
        ...(invitedCallIds.length > 0 ? [{ id: { [Op.in]: invitedCallIds } }] : []),
      ],
    };
  } else {
    where = { userId: authedUser.id };
  }
  if (fromDate && toDate) {
    const after = new Date(`${fromDate}T00:00:00.000Z`);
    const before = new Date(`${toDate}T23:59:59.999Z`);
    where.createdAt = { [Op.between]: [after, before] };
  }

  where = applyCallKindToWhere(where, callKindFilter);

  const { rows, count } = await db.CallLog.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    offset,
    limit: pageSize,
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
      "leadId",
      "disposition",
      "contactName",
      "city",
      "state",
      "zipCode",
      "createdAt",
    ],
    include: [
      {
        model: db.User,
        as: "user",
        attributes: ["id", "username"],
      },
      {
        model: db.Lead,
        as: "lead",
        attributes: ["id", "firstName", "lastName"],
        required: false,
      },
    ],
  });

  const callIds = rows.map((r) => r.id);
  /** Distinct invitee usernames per call (conference scope only). */
  let invitedNamesByCallId = new Map();
  if (conferenceOnly && callIds.length > 0) {
    const legs = await db.InviteDialLeg.findAll({
      where: { callLogId: callIds },
      attributes: ["callLogId", "invitedUserId"],
      include: [
        {
          model: db.User,
          as: "invitedUser",
          attributes: ["username"],
        },
      ],
      order: [["createdAt", "ASC"]],
    });
    for (const leg of legs) {
      const cid = leg.callLogId;
      const name = String(leg.invitedUser?.username || "").trim();
      if (!name) continue;
      if (!invitedNamesByCallId.has(cid)) invitedNamesByCallId.set(cid, []);
      const list = invitedNamesByCallId.get(cid);
      if (!list.includes(name)) list.push(name);
    }
  }

  return NextResponse.json({
    calls: rows.map((call) => {
      const recordingVisible = call.userId === authedUser.id || viewAll;
      const showInvitedNames = conferenceOnly && (viewAll || call.userId === authedUser.id);
      const invitedToNames = showInvitedNames ? invitedNamesByCallId.get(call.id) || [] : null;
      return {
        id: call.id,
        userId: call.userId,
        agentName: call.user?.username || "—",
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        direction: call.direction,
        status: call.status,
        twilioSid: call.twilioSid,
        customerCallSid: call.customerCallSid,
        agentDurationSeconds: call.agentDurationSeconds,
        customerDurationSeconds: call.customerDurationSeconds,
        durationSeconds: call.durationSeconds,
        recordingStatus: recordingVisible ? call.recordingStatus || null : null,
        recordingDurationSeconds: recordingVisible ? call.recordingDurationSeconds ?? null : null,
        recordingDownloadUrl:
          recordingVisible && call.recordingSid
            ? `/api/calls/recording/download/${call.id}`
            : null,
        createdAt: call.createdAt,
        callKind: call.callKind || null,
        dialMode: call.dialMode || null,
        leadId: call.leadId || null,
        leadName: call.lead
          ? [call.lead.firstName, call.lead.lastName].filter(Boolean).join(" ").trim() || null
          : null,
        disposition: call.disposition || null,
        contactName: call.contactName || null,
        city: call.city || null,
        state: call.state || null,
        zipCode: call.zipCode || null,
        ...(conferenceOnly ? { invitedToNames } : {}),
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
