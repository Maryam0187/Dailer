import { Op } from "sequelize";
import db from "@/server/db";
import { phoneVariants } from "@/server/ivr/phoneVariants";

function logMatchesNumber(toNumber, fromVariants) {
  if (!fromVariants?.size) return false;
  const raw = String(toNumber || "").trim();
  if (!raw) return false;
  if (fromVariants.has(raw)) return true;
  for (const v of phoneVariants(raw)) {
    if (fromVariants.has(v)) return true;
  }
  return false;
}

/**
 * For admin notifications page: did each non-admin notified user dial the
 * caller back after the notification was created?
 *
 * @param {Array<{ id: number, fromNumber?: string|null, createdAt?: Date|string|null }>} notifications
 * @param {Map<number, Array<{ id: number, name: string, role?: string|null }>>} notifiedById
 * @returns {Promise<Map<number, Array<{ id, name, calledBack, callLogId, status, durationSeconds, createdAt }>>>}
 */
export async function loadReturnCallStatusByNotification(notifications, notifiedById) {
  const out = new Map();
  const list = Array.isArray(notifications) ? notifications : [];
  if (!list.length) return out;

  const agentIds = new Set();
  const allVariants = new Set();
  let earliest = null;

  for (const row of list) {
    const agents = (notifiedById.get(row.id) || []).filter((u) => u.role !== "admin");
    out.set(
      row.id,
      agents.map((a) => ({
        id: a.id,
        name: a.name,
        calledBack: false,
        callLogId: null,
        status: null,
        durationSeconds: null,
        createdAt: null,
      })),
    );
    for (const a of agents) agentIds.add(a.id);
    for (const v of phoneVariants(row.fromNumber)) allVariants.add(v);
    const t = row.createdAt ? new Date(row.createdAt) : null;
    if (t && !Number.isNaN(t.getTime()) && (!earliest || t < earliest)) earliest = t;
  }

  if (!agentIds.size || !allVariants.size || !earliest) return out;

  let logs = [];
  try {
    logs = await db.CallLog.findAll({
      where: {
        direction: "outbound",
        userId: { [Op.in]: [...agentIds] },
        toNumber: { [Op.in]: [...allVariants] },
        createdAt: { [Op.gte]: earliest },
      },
      attributes: ["id", "userId", "toNumber", "status", "durationSeconds", "createdAt"],
      order: [["createdAt", "ASC"]],
      limit: 500,
    });
  } catch (err) {
    console.warn("[ivr/returnCallStatus]", err?.message || err);
    return out;
  }

  for (const row of list) {
    const since = row.createdAt ? new Date(row.createdAt) : null;
    if (!since || Number.isNaN(since.getTime())) continue;
    const fromVariants = new Set(phoneVariants(row.fromNumber));
    if (!fromVariants.size) continue;

    const agents = out.get(row.id) || [];
    const next = agents.map((agent) => {
      const match = logs.find(
        (log) =>
          Number(log.userId) === Number(agent.id) &&
          new Date(log.createdAt) >= since &&
          logMatchesNumber(log.toNumber, fromVariants),
      );
      if (!match) return agent;
      return {
        ...agent,
        calledBack: true,
        callLogId: match.id,
        status: match.status || null,
        durationSeconds: match.durationSeconds ?? null,
        createdAt: match.createdAt ? new Date(match.createdAt).toISOString() : null,
      };
    });
    out.set(row.id, next);
  }

  return out;
}
