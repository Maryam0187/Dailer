import { Op } from "sequelize";
import db from "@/server/db";
import { notifyCustomerCallStatus } from "@/server/calls/notifyCustomerCallStatus";
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

export function mergeCallDurationSeconds(agentDuration, customerDuration) {
  const a = agentDuration != null ? Number(agentDuration) : null;
  const c = customerDuration != null ? Number(customerDuration) : null;
  if (a == null && c == null) return null;
  return Math.max(a ?? 0, c ?? 0);
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
      [Op.or]: [{ twilioSid: sid }, { customerCallSid: sid }, { agentCallSid: sid }],
    },
  });
}

export function isCustomerFirstDial(call) {
  return String(call?.dialMode || "").trim().toLowerCase() === "customer_first";
}

/**
 * Agent &lt;Client&gt; child under customer-first parent (PSTN) call.
 */
export async function findAgentDialChild(client, parentCallSid) {
  const parentSid = String(parentCallSid || "").trim();
  if (!parentSid) return null;
  const children = await client.calls.list({ parentCallSid: parentSid, limit: 20 });
  return (
    children.find((c) => {
      const status = String(c.status || "").toLowerCase();
      if (!ACTIVE_CHILD_STATUSES.has(status)) return false;
      return isClientEndpoint(c.to);
    }) || null
  );
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
  if (patch.callSid && patch.leg === "agent" && isCustomerFirstDial(call)) {
    update.agentCallSid = String(patch.callSid).trim();
  }
  if (patch.status) {
    update.status = String(patch.status).toLowerCase();
  }

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
  if (merged != null) {
    update.durationSeconds = merged;
  }

  if (Object.keys(update).length === 0) return call;

  await call.update(update);
  const reloaded = await call.reload();

  if (patch.leg === "customer" && patch.status) {
    const customerSid =
      patch.callSid ||
      reloaded.customerCallSid ||
      (isCustomerFirstDial(reloaded) ? reloaded.twilioSid : null);
    notifyCustomerCallStatus(reloaded, {
      status: String(patch.status).toLowerCase(),
      callSid: customerSid,
      durationSeconds: patch.durationSeconds ?? reloaded.customerDurationSeconds,
      source: patch.source || "call-leg-update",
    });
  }

  return reloaded;
}

/**
 * Discover customer leg from Twilio and persist sid + duration when possible.
 */
export async function syncCustomerLegFromTwilio(call) {
  const parentSid = String(call?.twilioSid || "").trim();
  if (!parentSid) return call;

  const client = getTwilioClient();
  const child = isCustomerFirstDial(call)
    ? await findAgentDialChild(client, parentSid)
    : await findCustomerDialChild(client, parentSid);
  if (!child?.sid) return call;

  const childDuration = parseDurationSeconds(child.duration);
  const leg = isCustomerFirstDial(call) ? "agent" : "customer";
  return applyCallLegUpdate(call, {
    leg,
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

  const client = getTwilioClient();
  let next = call;

  const customerFirst = isCustomerFirstDial(next);

  try {
    const parent = await client.calls(parentSid).fetch();
    next = await applyCallLegUpdate(next, {
      leg: customerFirst ? "customer" : "agent",
      status: String(parent.status || "").toLowerCase() || undefined,
      durationSeconds: parseDurationSeconds(parent.duration),
    });
  } catch {
    /* ignore */
  }

  const otherSid = customerFirst
    ? String(next.agentCallSid || "").trim()
    : String(next.customerCallSid || "").trim();

  if (otherSid) {
    try {
      const other = await client.calls(otherSid).fetch();
      next = await applyCallLegUpdate(next, {
        leg: customerFirst ? "agent" : "customer",
        callSid: otherSid,
        status: String(other.status || "").toLowerCase() || undefined,
        durationSeconds: parseDurationSeconds(other.duration),
      });
    } catch {
      /* ignore */
    }
  } else {
    next = await syncCustomerLegFromTwilio(next);
  }

  return next;
}
