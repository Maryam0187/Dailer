import { Op } from "sequelize";
import db from "@/server/db";
import { getTwilioClient } from "@/server/twilio";
const ACTIVE_CHILD_STATUSES = new Set([
  "queued",
  "ringing",
  "in-progress",
  "answered",
  "completed",
]);

function isClientEndpoint(value) {
  const v = String(value || "").trim();
  return v.startsWith("client:");
}

export function parseDurationSeconds(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

const TERMINAL_CALL_STATUSES = new Set([
  "completed",
  "canceled",
  "cancelled",
  "failed",
  "busy",
  "no-answer",
]);

export function mergeCallDurationSeconds(agentDuration, customerDuration) {
  const a = agentDuration != null ? Number(agentDuration) : null;
  const c = customerDuration != null ? Number(customerDuration) : null;
  if (a == null && c == null) return null;
  return Math.max(a ?? 0, c ?? 0);
}

function longestDuration(...values) {
  let best = null;
  for (const value of values) {
    const n = value == null || value === "" ? null : Number(value);
    if (!Number.isFinite(n) || n < 0) continue;
    const rounded = Math.floor(n);
    if (best == null || rounded > best) best = rounded;
  }
  return best;
}

/** Seconds from the dial click to now, including connect and ring time. */
function secondsSinceDial(createdAt, endAt = new Date()) {
  if (!createdAt) return null;
  const startMs = new Date(createdAt).getTime();
  const endMs = endAt instanceof Date ? endAt.getTime() : new Date(endAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

/**
 * Find the PSTN child leg created by &lt;Dial&gt; under the agent (parent) call.
 */
export async function findCustomerDialChild(client, parentCallSid) {
  const parentSid = String(parentCallSid || "").trim();
  if (!parentSid) return null;
  const children = await client.calls.list({ parentCallSid: parentSid, limit: 20 });
  return (
    children.find((c) => {
      const status = String(c.status || "").toLowerCase();
      if (!ACTIVE_CHILD_STATUSES.has(status)) return false;
      const to = String(c.to || "").trim();
      return to && !isClientEndpoint(to);
    }) || null
  );
}

/**
 * @param {import("sequelize").Model | { id: number, twilioSid?: string, customerCallSid?: string, agentDurationSeconds?: number, customerDurationSeconds?: number, durationSeconds?: number }} call
 */
export async function findCallLogByAnyLegSid(callSid) {
  const sid = String(callSid || "").trim();
  if (!sid) return null;
  return db.CallLog.findOne({
    where: {
      [Op.or]: [{ twilioSid: sid }, { customerCallSid: sid }],
    },
  });
}

/**
 * @param {import("sequelize").Model} call
 * @param {{ leg: "agent" | "customer", callSid?: string, status?: string, durationSeconds?: number | null, source?: string }} patch
 */
export async function applyCallLegUpdate(call, patch) {
  if (!call?.id) return call;

  const update = {};
  if (patch.callSid && patch.leg === "customer") {
    update.customerCallSid = String(patch.callSid).trim();
  }

  if (patch.status) {
    update.status = String(patch.status).toLowerCase();
  }

  const conference = Boolean(
    String(call.pendingConferenceName || "").trim() ||
    String(call.conferenceName || "").trim(),
  );
  const terminal =
    patch.status && TERMINAL_CALL_STATUSES.has(String(patch.status).toLowerCase());

  const agentDuration =
    patch.leg === "agent" && patch.durationSeconds != null
      ? patch.durationSeconds
      : call.agentDurationSeconds;
  const customerDuration =
    patch.leg === "customer" && patch.durationSeconds != null
      ? patch.durationSeconds
      : call.customerDurationSeconds;

  if (patch.leg === "agent" && patch.durationSeconds != null) {
    update.agentDurationSeconds = patch.durationSeconds;
  }
  if (patch.leg === "customer" && patch.durationSeconds != null) {
    update.customerDurationSeconds = patch.durationSeconds;
  }

  const merged = mergeCallDurationSeconds(
    update.agentDurationSeconds ?? agentDuration,
    update.customerDurationSeconds ?? customerDuration,
  );
  // Conference calls keep Twilio's reported duration. Direct calls also store
  // ringing and connecting time from the dial click.
  const fromDial = terminal && !conference ? secondsSinceDial(call.createdAt) : null;
  const duration = conference ? merged : longestDuration(merged, fromDial);
  if (duration != null) {
    update.durationSeconds = duration;
  }

  if (Object.keys(update).length === 0) return call;

  await call.update(update);
  const refreshed = await call.reload();
  try {
    const { refreshCallDailyMetricsForCall } = await import(
      "@/server/calls/callDailyMetrics"
    );
    await refreshCallDailyMetricsForCall(refreshed);
  } catch {
    /* rollup is best-effort; raw CallLog is source until backfill */
  }
  return refreshed;
}

/**
 * Discover customer leg from Twilio and persist sid + duration when possible.
 */
async function twilioClientForCall(call) {
  const ownerId = Number(call?.userId);
  if (Number.isInteger(ownerId) && ownerId > 0) {
    try {
      const { getTwilioContextForUserId } = await import("@/server/twilio/callOwnerTwilio");
      return (await getTwilioContextForUserId(ownerId)).client;
    } catch {
      /* fall through */
    }
  }
  return getTwilioClient();
}

export async function syncCustomerLegFromTwilio(call) {
  const parentSid = String(call?.twilioSid || "").trim();
  if (!parentSid) return call;

  const client = await twilioClientForCall(call);
  const child = await findCustomerDialChild(client, parentSid);
  if (!child?.sid) return call;

  const childDuration = parseDurationSeconds(child.duration);
  return applyCallLegUpdate(call, {
    leg: "customer",
    callSid: child.sid,
    status: String(child.status || "").toLowerCase() || undefined,
    durationSeconds: childDuration,
  });
}

/**
 * Refresh both legs from Twilio (e.g. on call end).
 */
export async function syncAllLegDurationsFromTwilio(call) {
  const parentSid = String(call?.twilioSid || "").trim();
  if (!parentSid) return call;

  const client = await twilioClientForCall(call);
  let next = call;

  try {
    const parent = await client.calls(parentSid).fetch();
    next = await applyCallLegUpdate(next, {
      leg: "agent",
      status: String(parent.status || "").toLowerCase() || undefined,
      durationSeconds: parseDurationSeconds(parent.duration),
    });
  } catch {
    /* ignore */
  }

  const customerSid = String(next.customerCallSid || "").trim();
  if (customerSid) {
    try {
      const customer = await client.calls(customerSid).fetch();
      next = await applyCallLegUpdate(next, {
        leg: "customer",
        status: String(customer.status || "").toLowerCase() || undefined,
        durationSeconds: parseDurationSeconds(customer.duration),
      });
    } catch {
      /* ignore */
    }
  } else {
    next = await syncCustomerLegFromTwilio(next);
  }

  return next;
}
