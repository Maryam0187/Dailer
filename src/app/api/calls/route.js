import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  applyCallKindToWhere,
  applyDialerIndexToWhere,
  applyVoiceProviderToWhere,
  parseCallScope,
  parseDialerIndexFilter,
  parseVoiceProviderFilter,
} from "@/server/calls/callKindFilter";
import {
  conferenceCallIds,
  dateRangeWhere,
  invitedConferenceCallIds,
} from "@/server/calls/aggregateMetrics";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { validateListSearchQuery } from "@/lib/listSearchValidation";

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

/** Admin phone search on fromNumber / toNumber (national digits + E.164). */
function buildCallNumberSearchWhere(q) {
  const check = validateListSearchQuery("phone", q);
  if (!check.isValid) return { error: check.message };
  if (!check.normalized) return null;

  const phoneDigits = check.normalized;
  const or = [
    { fromNumber: { [Op.like]: `%${phoneDigits}%` } },
    { toNumber: { [Op.like]: `%${phoneDigits}%` } },
  ];
  const normalized = normalizeToE164(phoneDigits);
  if (normalized) {
    or.push({ fromNumber: normalized });
    or.push({ toNumber: normalized });
  }
  return { [Op.or]: or };
}

function andWhere(base, extra) {
  if (!extra) return base;
  if (!base || Object.keys(base).length === 0) return extra;
  return { [Op.and]: [base, extra] };
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
  /** `all` | `lead` | `conference` */
  const scope = String(searchParams.get("scope") || "all").trim().toLowerCase();
  const { kind: callKindFilter, conferenceOnly } = parseCallScope(scope);
  const dialerIndexFilter = parseDialerIndexFilter(searchParams.get("dialerIndex"));
  const voiceProviderFilter = parseVoiceProviderFilter(searchParams.get("voiceProvider"));
  const hasRecording =
    searchParams.get("hasRecording") === "true" ||
    searchParams.get("hasRecording") === "1";
  /** Admin-only: `view=all` returns every user's call logs on the home page. */
  const view = String(searchParams.get("view") || "mine").trim().toLowerCase();
  const viewAll = view === "all" && authedUser.role === "admin";
  /** Admin-only: search by phone number (fromNumber / toNumber). */
  const qRaw = String(searchParams.get("q") || "").trim();
  let numberSearchWhere = null;
  if (qRaw) {
    if (authedUser.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const built = buildCallNumberSearchWhere(qRaw);
    if (built?.error) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }
    numberSearchWhere = built;
  }

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    return NextResponse.json({ error: "fromDate and toDate must both be provided" }, { status: 400 });
  }
  if (fromDate && toDate && fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before or equal to toDate" }, { status: 400 });
  }

  // Number search skips the date window (same idea as leads list search).
  const useDateRange = Boolean(fromDate && toDate && !numberSearchWhere);
  const dateOpts = useDateRange ? { fromDate, toDate } : {};

  // Home page lists only the signed-in user's own calls unless admin passes view=all.
  // For conference scope, also include calls where this user was invited as an agent.
  let where;
  if (viewAll) {
    if (conferenceOnly) {
      const conferenceIdList = await conferenceCallIds(dateOpts);

      if (conferenceIdList.length === 0) {
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

      where = { id: { [Op.in]: conferenceIdList } };
    } else {
      where = {};
    }
  } else if (conferenceOnly) {
    const conferenceIdList = await conferenceCallIds(dateOpts);
    const invitedCallIds = await invitedConferenceCallIds(authedUser.id, dateOpts);

    if (conferenceIdList.length === 0 && invitedCallIds.length === 0) {
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
        ...(conferenceIdList.length > 0
          ? [{ [Op.and]: [{ userId: authedUser.id }, { id: { [Op.in]: conferenceIdList } }] }]
          : []),
        ...(invitedCallIds.length > 0 ? [{ id: { [Op.in]: invitedCallIds } }] : []),
      ],
    };
  } else {
    where = { userId: authedUser.id };
  }
  if (useDateRange) {
    Object.assign(where, dateRangeWhere(fromDate, toDate));
  }
  if (hasRecording) {
    where.recordingSid = { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] };
  }

  where = applyCallKindToWhere(where, callKindFilter);
  where = applyDialerIndexToWhere(where, dialerIndexFilter);
  where = applyVoiceProviderToWhere(where, voiceProviderFilter);
  where = andWhere(where, numberSearchWhere);

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
      "dialerIndex",
      "voiceProvider",
      "externalCallId",
      "zoomExtensionNumber",
      "zoomPhoneNumber",
      "zoomDisplayName",
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
        attributes: ["id", "fullName", "cellNumber"],
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
        dialMode: call.dialMode || "agent_first",
        leadId: call.leadId || null,
        leadName: call.lead?.fullName?.trim() || null,
        disposition: call.disposition || null,
        contactName: call.contactName || null,
        city: call.city || null,
        state: call.state || null,
        zipCode: call.zipCode || null,
        dialerIndex: Number(call.dialerIndex) === 2 ? 2 : 1,
        voiceProvider: call.voiceProvider === "zoom" ? "zoom" : "twilio",
        zoomExtensionNumber: call.zoomExtensionNumber || null,
        zoomPhoneNumber: call.zoomPhoneNumber || null,
        zoomDisplayName: call.zoomDisplayName || null,
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
