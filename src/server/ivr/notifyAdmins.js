import db from "@/server/db";
import { emitToUser, isUserOnline } from "@/server/socketHub";
import { isIvrAlertEnabled } from "@/server/ivr/buildIvrAlert";
import { persistIvrNotification } from "@/server/ivr/persistIvrNotification";
import { resolveInboundNotifyTargets } from "@/server/ivr/resolveInboundNotifyTargets";
import { sendPushToUser } from "@/server/push/oneSignal";
import { ourLineKind } from "@/lib/ourLineKind";
import { resolveVoiceProvider } from "@/lib/voiceProviderLabel";

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "") ||
    ""
  );
}

function uniqPositiveIds(ids) {
  const out = [];
  const seen = new Set();
  for (const raw of ids || []) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function buildAgentCopy({ messageMode, from, lastSale }) {
  const fromLabel = String(from || "").trim() || "Unknown";
  const leadBit = lastSale?.fullName
    ? ` (${lastSale.fullName}${lastSale.id ? ` #${lastSale.id}` : ""})`
    : lastSale?.id
      ? ` (#${lastSale.id})`
      : "";

  if (messageMode === "ask_admin") {
    return {
      title: "Inbound callback",
      body: `Callback from ${fromLabel}${leadBit} — this caller is already in our system. Ask an admin for further action.`,
    };
  }
  if (messageMode === "callback" || messageMode === "lead_callback") {
    return {
      title: "Inbound callback",
      body: `Incoming callback from ${fromLabel}${leadBit}.`,
    };
  }
  return {
    title: "Incoming call",
    body: `Incoming call from ${fromLabel}.`,
  };
}

async function loadActiveAdminIds() {
  try {
    const admins = await db.User.findAll({
      where: { role: "admin", isActive: true },
      attributes: ["id"],
    });
    return uniqPositiveIds(admins.map((a) => a.id));
  } catch (err) {
    console.warn("[ivr/notify] admins", err?.message || err);
    return [];
  }
}

/**
 * Persist + socket toast (+ push for offline agents). No email.
 * Resolves call-log (admin lookback days) / lead targets cheaply when not pre-resolved.
 */
export async function notifyAdmins(raw) {
  if (!isIvrAlertEnabled()) {
    return { emailed: false, socketTargets: 0, skipped: true };
  }

  const from = String(raw?.from || "").trim() || null;
  const to = String(raw?.to || "").trim() || null;

  let resolved = raw?.resolved || null;
  if (!resolved) {
    try {
      resolved = await resolveInboundNotifyTargets({ from });
    } catch (err) {
      console.warn("[ivr/notify] resolve", err?.message || err);
      resolved = {
        agentNotifyUserIds: [],
        leadInSystem: false,
        lastSale: null,
        customer: null,
        relatedCallLogs: [],
        notifySource: "none",
        messageMode: "incoming",
      };
    }
  }

  const adminIds = await loadActiveAdminIds();
  const agentIds = uniqPositiveIds(resolved.agentNotifyUserIds);
  const recipientUserIds = uniqPositiveIds([...agentIds, ...adminIds]);

  const callSid = String(raw?.callSid || "").trim() || null;
  const voiceProvider = resolveVoiceProvider({
    callSid,
    voiceProvider: raw?.voiceProvider,
  });

  const payload = {
    type: String(raw?.type || "incoming"),
    step: raw?.step != null ? String(raw.step) : null,
    from,
    to,
    callSid,
    voiceProvider,
    choice: raw?.choice != null ? String(raw.choice).trim() : null,
    at: new Date().toISOString(),
    leadInSystem: Boolean(resolved.leadInSystem),
    notifySource: resolved.notifySource || null,
    messageMode: resolved.messageMode || "incoming",
    lineKind: ourLineKind(to),
  };

  const notification = await persistIvrNotification(payload, {
    skipCustomerLookup: true,
    customer: resolved.customer || null,
    lastSale: resolved.lastSale || null,
    relatedCallLogs: resolved.relatedCallLogs || [],
    recipientUserIds,
    voiceProvider,
  });

  const copy = buildAgentCopy({
    messageMode: payload.messageMode,
    from,
    lastSale: resolved.lastSale,
  });

  const socketPayload = {
    ...payload,
    title: copy.title,
    body: copy.body,
    customer: notification?.customer || resolved.customer || null,
    customers: Array.isArray(notification?.customers)
      ? notification.customers
      : resolved.customer
        ? [resolved.customer]
        : [],
    lastSale: resolved.lastSale || notification?.lastSale || null,
    relatedCallLogs: resolved.relatedCallLogs || [],
    notificationId: notification?.id || null,
    notification: notification || null,
  };

  let socketTargets = 0;
  const agentIdSet = new Set(agentIds);

  for (const userId of recipientUserIds) {
    try {
      if (emitToUser(userId, "ivr:alert", socketPayload)) socketTargets += 1;
    } catch (err) {
      console.warn("[ivr/notify] socket", userId, err?.message || err);
    }

    // Push only offline agents in the affinity/lead notify set (not every admin).
    if (agentIdSet.has(userId) && !isUserOnline(userId)) {
      const base = getAppBaseUrl();
      const url = base ? `${base}/ivr-notifications` : "/ivr-notifications";
      void sendPushToUser(userId, {
        title: copy.title,
        body: copy.body,
        url,
      });
    }
  }

  return {
    emailed: false,
    socketTargets,
    payload: socketPayload,
    notification,
    recipientUserIds,
  };
}

/** Fire-and-forget wrapper for Twilio webhooks (never block TwiML). */
export function notifyInboundCallbackAsync(raw) {
  void notifyAdmins(raw).catch((err) => {
    console.warn("[ivr/notify] async", err?.message || err);
  });
}

/**
 * Zoom Soft Embed inbound → same callback notify as Twilio.
 * Dedupes by callSid so multiple open Soft Embed sessions only alert once.
 */
export function notifyZoomInboundCallbackOnce({
  from,
  to,
  zoomCallId,
  eventType = "incoming",
} = {}) {
  const externalId = String(zoomCallId || "").trim();
  const fromNumber = String(from || "").trim();
  if (!externalId || !fromNumber) return;

  const callSid = `zoom:${externalId}`.slice(0, 64);

  void (async () => {
    try {
      const existing = await db.IvrNotification.findOne({
        where: { callSid },
        attributes: ["id"],
      });
      if (existing) return;

      await notifyAdmins({
        type: String(eventType || "incoming"),
        from: fromNumber,
        to: String(to || "").trim() || null,
        callSid,
        voiceProvider: "zoom",
      });
    } catch (err) {
      console.warn("[ivr/notify] zoom inbound", err?.message || err);
    }
  })();
}
