import { Op } from "sequelize";
import db from "@/server/db";
import { derivePresence } from "@/server/auth/presence";
import { getCurrentApprovedLeaveByUserIds } from "@/server/leave/userLeave";
import { finalizeStaleZoomPendingCalls } from "@/server/calls/zoomCallLog";

const ACTIVE_CALL_STATUSES = ["queued", "ringing", "in-progress", "initiated", "answered"];
/** Drop DB rows stuck in "active" longer than this (Twilio webhooks usually clear sooner). */
const STALE_ACTIVE_MS = 60 * 60 * 1000;

function isZoomNeverStarted(row) {
  if (row?.voiceProvider !== "zoom") return false;
  const status = String(row.status || "").toLowerCase();
  if (status !== "initiated" && status !== "queued") return false;
  const ext = String(row.externalCallId || "").trim();
  return !ext;
}

function rowAgeMs(row) {
  const touched = row?.updatedAt || row?.createdAt;
  if (!touched) return Infinity;
  return Date.now() - new Date(touched).getTime();
}

function serializeActiveCall(row, { invited = false } = {}) {
  const status = String(row.status || "").toLowerCase();
  const isZoom = row.voiceProvider === "zoom";
  // Zoom: only count talk time after Soft Embed reports connected — not dial-click wait.
  const talkStartedAt = isZoom
    ? row.zoomConnectedAt || null
    : row.createdAt ?? null;
  const startedAt = talkStartedAt || row.createdAt || null;
  const startedMs = talkStartedAt ? new Date(talkStartedAt).getTime() : null;
  let durationSeconds = null;
  if (isZoom && !row.zoomConnectedAt) {
    durationSeconds = 0;
  } else if (Number.isFinite(startedMs) && startedMs > 0) {
    durationSeconds = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
  }
  return {
    callId: row.id,
    toNumber: row.toNumber ?? null,
    fromNumber: row.fromNumber ?? null,
    direction: row.direction || "outbound",
    status,
    dialerIndex: Number(row.dialerIndex) === 2 ? 2 : 1,
    voiceProvider: isZoom ? "zoom" : "twilio",
    conferenceName: row.conferenceName ?? null,
    leadId: row.leadId ?? null,
    startedAt,
    durationSeconds,
    invited,
  };
}

/**
 * Bulk live board: presence + on-call + last call time.
 * Uses DB call status (webhook-updated); does not hit Twilio per agent.
 * Pass `managerId` to scope to one manager's team.
 */
export async function getLiveAgentStatus({ roles = null, managerId = null } = {}) {
  const where = {
    isActive: { [Op.ne]: false },
  };
  if (Array.isArray(roles) && roles.length > 0) {
    where.role = { [Op.in]: roles };
  }
  const scopedManagerId = Number(managerId);
  if (Number.isInteger(scopedManagerId) && scopedManagerId > 0) {
    where.managerId = scopedManagerId;
  }

  const users = await db.User.findAll({
    attributes: [
      "id",
      "username",
      "displayName",
      "role",
      "shiftKey",
      "isOutside",
      "managerId",
      "supervisorId",
      "activeSessionId",
      "activeSessionLastSeenAt",
    ],
    where,
    order: [["username", "ASC"]],
  });

  const userIds = users.map((u) => u.id);
  const now = Date.now();

  if (userIds.length === 0) {
    return {
      agents: [],
      managers: [],
      summary: emptySummary(),
      generatedAt: new Date().toISOString(),
    };
  }

  // Clear Zoom "Connecting" orphans (click-to-dial with no Soft Embed / no Phone license).
  await finalizeStaleZoomPendingCalls().catch(() => {});

  const [activeOwned, inviteLegs, lastCallRows, currentLeaveByUserId] = await Promise.all([
    db.CallLog.findAll({
      attributes: [
        "id",
        "userId",
        "toNumber",
        "fromNumber",
        "direction",
        "status",
        "dialerIndex",
        "voiceProvider",
        "conferenceName",
        "leadId",
        "externalCallId",
        "zoomConnectedAt",
        "createdAt",
        "updatedAt",
      ],
      where: {
        userId: { [Op.in]: userIds },
        status: { [Op.in]: ACTIVE_CALL_STATUSES },
      },
      order: [["updatedAt", "DESC"]],
    }),
    db.InviteDialLeg
      ? db.InviteDialLeg.findAll({
          where: { invitedUserId: { [Op.in]: userIds } },
          include: [
            {
              model: db.CallLog,
              required: true,
              where: { status: { [Op.in]: ACTIVE_CALL_STATUSES } },
              attributes: [
                "id",
                "userId",
                "toNumber",
                "fromNumber",
                "direction",
                "status",
                "dialerIndex",
                "voiceProvider",
                "conferenceName",
                "leadId",
                "externalCallId",
                "zoomConnectedAt",
                "createdAt",
                "updatedAt",
              ],
            },
          ],
        })
      : Promise.resolve([]),
    db.CallLog.findAll({
      attributes: ["userId", [db.sequelize.fn("MAX", db.sequelize.col("createdAt")), "lastCallAt"]],
      where: { userId: { [Op.in]: userIds } },
      group: ["userId"],
      raw: true,
    }),
    getCurrentApprovedLeaveByUserIds(userIds),
  ]);

  const activeByUserId = new Map();
  for (const row of activeOwned) {
    if (rowAgeMs(row) > STALE_ACTIVE_MS) continue;
    // Zoom click-to-dial reservation only — Soft Embed never started. Not on a call.
    if (isZoomNeverStarted(row)) continue;
    const uid = Number(row.userId);
    if (!activeByUserId.has(uid)) {
      activeByUserId.set(uid, serializeActiveCall(row, { invited: false }));
    }
  }

  for (const leg of inviteLegs) {
    const uid = Number(leg.invitedUserId);
    if (!Number.isInteger(uid) || uid <= 0) continue;
    if (activeByUserId.has(uid)) continue;
    const call = leg.CallLog || leg.callLog;
    if (!call || rowAgeMs(call) > STALE_ACTIVE_MS) continue;
    activeByUserId.set(uid, serializeActiveCall(call, { invited: true }));
  }

  const lastCallByUserId = new Map();
  for (const row of lastCallRows) {
    const uid = Number(row.userId);
    if (!Number.isInteger(uid) || uid <= 0) continue;
    lastCallByUserId.set(uid, row.lastCallAt ?? null);
  }

  const managerIds = [
    ...new Set(
      users
        .map((u) => Number(u.managerId))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  const managerRows =
    managerIds.length > 0
      ? await db.User.findAll({
          attributes: ["id", "username", "displayName"],
          where: { id: { [Op.in]: managerIds } },
        })
      : [];
  const managerById = new Map(
    managerRows.map((m) => [
      Number(m.id),
      {
        id: m.id,
        username: m.username,
        displayName: m.displayName ? String(m.displayName) : null,
      },
    ]),
  );

  const agents = users.map((u) => {
    const presence = derivePresence(
      {
        id: u.id,
        activeSessionId: u.activeSessionId,
        activeSessionLastSeenAt: u.activeSessionLastSeenAt,
      },
      now,
    );
    const activeCall = activeByUserId.get(Number(u.id)) ?? null;
    const managerId = u.managerId != null ? Number(u.managerId) : null;
    const manager = managerId != null ? managerById.get(managerId) ?? null : null;
    const currentLeave = currentLeaveByUserId.get(u.id) ?? null;
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName ? String(u.displayName) : null,
      role: u.role,
      shiftKey: u.shiftKey === "night" ? "night" : "day",
      isOutside: Boolean(u.isOutside),
      managerId: Number.isInteger(managerId) && managerId > 0 ? managerId : null,
      managerUsername: manager?.username ?? null,
      managerDisplayName: manager?.displayName ?? null,
      supervisorId: u.supervisorId ?? null,
      presence: presence.status,
      lastActiveAt: presence.lastActiveAt,
      onCall: Boolean(activeCall),
      activeCall,
      lastCallAt: lastCallByUserId.get(Number(u.id)) ?? null,
      isOnLeave: Boolean(currentLeave),
      currentLeave: currentLeave
        ? {
            id: currentLeave.id,
            startDate: currentLeave.startDate,
            endDate: currentLeave.endDate,
            reason: currentLeave.reason ?? null,
          }
        : null,
    };
  });

  // On call → online (newest last call first) → away → offline.
  agents.sort((a, b) => {
    const rank = (agent) => {
      if (agent.onCall) return 0;
      if (agent.presence === "online") return 1;
      if (agent.presence === "away") return 2;
      return 3;
    };
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    const aMs = a.lastCallAt ? new Date(a.lastCallAt).getTime() : 0;
    const bMs = b.lastCallAt ? new Date(b.lastCallAt).getTime() : 0;
    const aTime = Number.isFinite(aMs) ? aMs : 0;
    const bTime = Number.isFinite(bMs) ? bMs : 0;
    if (aTime !== bTime) return bTime - aTime;
    return (a.username || "").localeCompare(b.username || "");
  });

  const managersFromTeam = users
    .filter((u) => u.role === "manager")
    .map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName ? String(u.displayName) : null,
    }));
  const managersMap = new Map();
  for (const m of [...managerById.values(), ...managersFromTeam]) {
    managersMap.set(Number(m.id), m);
  }
  const managers = [...managersMap.values()].sort((a, b) =>
    (a.username || "").localeCompare(b.username || ""),
  );

  return {
    agents,
    managers,
    summary: buildSummary(agents),
    generatedAt: new Date().toISOString(),
  };
}

function emptySummary() {
  return {
    total: 0,
    online: 0,
    away: 0,
    offline: 0,
    onCall: 0,
    available: 0,
    onLeave: 0,
  };
}

function buildSummary(agents) {
  const summary = emptySummary();
  summary.total = agents.length;
  for (const a of agents) {
    if (a.presence === "online") summary.online += 1;
    else if (a.presence === "away") summary.away += 1;
    else summary.offline += 1;
    if (a.onCall) summary.onCall += 1;
    else if (a.presence === "online") summary.available += 1;
    if (a.isOnLeave) summary.onLeave += 1;
  }
  return summary;
}
