import db from "@/server/db";
import { isUserOnline } from "@/server/socketHub";
import { toOneSignalExternalId } from "@/lib/oneSignalExternalId";
import {
  describeOneSignalAuth,
  getOneSignalAppId,
  getOneSignalRestApiKey,
} from "@/server/push/oneSignalEnv";

function getAppBaseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.TWILIO_WEBHOOK_BASE_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    "";
  let base = String(raw).trim().replace(/\/$/, "").replace(/^["']|["']$/g, "");
  if (base && !/^https?:\/\//i.test(base)) {
    base = `https://${base}`;
  }
  return base;
}

function truncate(text, max = 120) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

async function resolveExternalId(userId, usernameHint = null) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;

  let username = usernameHint;
  if (username == null || String(username).trim() === "") {
    try {
      const row = await db.User.findByPk(id, { attributes: ["username"] });
      username = row?.username || null;
    } catch (err) {
      console.warn("[onesignal] username lookup failed", err?.message || err);
      return null;
    }
  }
  return toOneSignalExternalId(id, username);
}

function isWebPushSubscription(s) {
  if (!s?.id) return false;
  const type = String(s.type || "");
  // Skip non-push channels
  if (/email|sms|iospush|androidpush|huawei|adm/i.test(type)) return false;
  // ChromePush / FirefoxPush / SafariPush / any chrome/firefox/safari/web label
  if (/chrome|firefox|safari|edge|web|push/i.test(type)) return true;
  // FCM web tokens look like https://fcm.googleapis.com/...
  if (typeof s.token === "string" && /fcm\.googleapis\.com|mozilla\.com|web\.push/i.test(s.token)) {
    return true;
  }
  return Boolean(s.token);
}

/**
 * Only clearly Subscribed web push.
 * Dashboard "Unsubscribed" → notification_types <= 0 (often -2).
 * Sending to those shows Audience 1 / Unsubscribed 1 / Delivered 0.
 * Require notification_types >= 1 — do not treat null as subscribed.
 */
function isSubscribedPush(s) {
  if (!isWebPushSubscription(s)) return false;
  if (s.enabled === false) return false;
  const nt = Number(s.notification_types);
  if (!Number.isFinite(nt) || nt < 1) return false;
  // Prefer a real push token when present; some API payloads omit it but still subscribed
  return true;
}

async function fetchUserPushSubscriptions(externalId) {
  const appId = getOneSignalAppId();
  const apiKey = getOneSignalRestApiKey();
  if (!appId || !apiKey || !externalId) {
    return { found: false, pushCount: 0, subscriptionIds: [], subscriptions: [], error: "not_configured" };
  }

  try {
    const res = await fetch(
      `https://api.onesignal.com/apps/${encodeURIComponent(appId)}/users/by/external_id/${encodeURIComponent(externalId)}`,
      {
        headers: {
          Authorization: `Key ${apiKey}`,
          Accept: "application/json",
        },
      },
    );
    const json = await res.json().catch(() => ({}));
    if (res.status === 404) {
      return { found: false, pushCount: 0, subscriptionIds: [], subscriptions: [], error: "user_not_found" };
    }
    if (!res.ok) {
      return {
        found: false,
        pushCount: 0,
        subscriptionIds: [],
        subscriptions: [],
        error: json?.errors || json,
        status: res.status,
      };
    }

    const all = Array.isArray(json?.subscriptions) ? json.subscriptions : [];
    const subscribed = all.filter(isSubscribedPush);

    // Prefer most recently active subscribed device
    subscribed.sort((a, b) => {
      const ta = Date.parse(a.last_active || a.updated_at || a.created_at || 0) || 0;
      const tb = Date.parse(b.last_active || b.updated_at || b.created_at || 0) || 0;
      return tb - ta;
    });

    const unsubscribedCount = all.filter(
      (s) => isWebPushSubscription(s) && s.notification_types != null && Number(s.notification_types) <= 0,
    ).length;

    return {
      found: true,
      pushCount: subscribed.length,
      subscriptionIds: subscribed.map((s) => s.id).filter(Boolean),
      subscriptions: subscribed.map((s) => ({
        id: s.id,
        type: s.type,
        enabled: s.enabled,
        notification_types: s.notification_types,
        hasToken: Boolean(s.token),
        last_active: s.last_active || null,
        // Helps tell phone vs desktop in Railway logs / OneSignal Audience
        device_model: s.device_model || s.device_os || null,
        device_os: s.device_os || null,
        sdk: s.sdk || null,
        session_count: s.session_count ?? null,
      })),
      unsubscribedCount,
      allTypes: all.map((s) => ({
        id: s.id,
        type: s.type,
        enabled: s.enabled,
        notification_types: s.notification_types,
        device_model: s.device_model || null,
        device_os: s.device_os || null,
        status: s.notification_types != null && Number(s.notification_types) > 0 ? "subscribed" : "unsubscribed_or_unknown",
      })),
      onesignalId: json?.identity?.onesignal_id || null,
    };
  } catch (err) {
    return {
      found: false,
      pushCount: 0,
      subscriptionIds: [],
      subscriptions: [],
      error: err?.message || String(err),
    };
  }
}

async function postNotification(payload) {
  const apiKey = getOneSignalRestApiKey();
  const res = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

/**
 * Send a web push to every subscription linked to this dialer userId.
 * Prefer include_subscription_ids — include_aliases often returns "No recipients" for web push.
 */
export async function sendPushToUser(userId, { title, body, url, username } = {}) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, skipped: true, reason: "invalid_user" };
  }

  const appId = getOneSignalAppId();
  const apiKey = getOneSignalRestApiKey();
  const authInfo = describeOneSignalAuth();

  if (!appId || !apiKey) {
    console.warn("[onesignal] not configured", authInfo);
    return { ok: false, skipped: true, reason: "not_configured", auth: authInfo };
  }

  const externalId = await resolveExternalId(id, username);
  if (!externalId) {
    return { ok: false, skipped: true, reason: "invalid_user" };
  }

  const subInfo = await fetchUserPushSubscriptions(externalId);
  if (!subInfo.found || !subInfo.subscriptionIds.length) {
    console.warn(
      "[onesignal] no Subscribed web push for user — Allow notifications again (ignore Unsubscribed rows)",
      { externalId, userId: id, subInfo },
    );
    return { ok: false, skipped: true, reason: "no_subscription", externalId, subInfo };
  }

  console.info("[onesignal] targeting subscribed devices", {
    externalId,
    userId: id,
    subscriptionIds: subInfo.subscriptionIds,
    subscriptions: subInfo.subscriptions,
    unsubscribedIgnored: subInfo.unsubscribedCount || 0,
    allTypes: subInfo.allTypes,
  });

  const base = {
    app_id: appId,
    headings: { en: truncate(title || "Dialer", 50) || "Dialer" },
    contents: { en: truncate(body || "You have a new message", 120) || "You have a new message" },
    isAnyWeb: true,
  };
  if (url) base.url = String(url);

  try {
    // Only subscription IDs that passed notification_types >= 1.
    // Do NOT fall back to external_id alias — that can hit Unsubscribed devices
    // and produce Audience 1 / Unsubscribed 1 / Delivered 0.
    const { res, json } = await postNotification({
      ...base,
      include_subscription_ids: subInfo.subscriptionIds,
    });

    if (res.status === 401) {
      console.warn("[onesignal] 401 — invalid REST API key", authInfo);
      return { ok: false, status: 401, reason: "invalid_api_key", externalId, auth: authInfo, error: json };
    }

    if (!res.ok) {
      console.warn("[onesignal] send failed", {
        status: res.status,
        externalId,
        userId: id,
        errors: json?.errors || json,
        subInfo,
      });
      return { ok: false, status: res.status, error: json, externalId, subInfo };
    }

    if (!json?.id) {
      console.warn("[onesignal] no message id (dashboard would show No recipients)", {
        externalId,
        userId: id,
        response: json,
        subInfo,
      });
      return { ok: false, skipped: true, reason: "no_message_id", externalId, response: json, subInfo };
    }

    if (json.recipients === 0) {
      console.warn("[onesignal] 0 recipients for subscription_ids", {
        externalId,
        userId: id,
        response: json,
        subInfo,
      });
      return { ok: false, skipped: true, reason: "no_recipients", externalId, response: json, subInfo };
    }

    console.info("[onesignal] push sent", {
      externalId,
      userId: id,
      via: "subscription_ids",
      subscriptionIds: subInfo.subscriptionIds,
      recipients: json.recipients ?? "n/a",
      id: json.id,
    });
    return {
      ok: true,
      id: json.id,
      recipients: json.recipients ?? null,
      externalId,
      subscriptionIds: subInfo.subscriptionIds,
      pushSubscriptions: subInfo.pushCount,
    };
  } catch (err) {
    console.warn("[onesignal] send error", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

export function notifyOfflineMessage(userId, { title, body, conversationId } = {}) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;

  const online = isUserOnline(id);
  const base = getAppBaseUrl();
  const path =
    conversationId != null && Number(conversationId) > 0
      ? `/messages?c=${Number(conversationId)}`
      : "/messages";
  const url = base ? `${base}${path}` : path;

  console.info("[onesignal] message push enqueue", { userId: id, online });
  void sendPushToUser(id, { title, body, url });
}

export function buildMessagePushCopy({ senderName, messageBody, hasAttachments = false } = {}) {
  const title = truncate(senderName || "New message", 50) || "New message";
  let body = truncate(messageBody, 120);
  if (!body) {
    body = hasAttachments ? "Sent an attachment" : "You have a new message";
  }
  return { title, body };
}
