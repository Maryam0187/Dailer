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
  // OneSignal web types: ChromePush, FirefoxPush, SafariPush, etc.
  if (/email|sms|iospush|androidpush|huawei|adm/i.test(type)) return false;
  if (/chrome|firefox|safari|edge|web/i.test(type)) return true;
  // Unknown type with a push token — treat as push candidate
  return Boolean(s.token);
}

function isLikelySubscribed(s) {
  // enabled false / missing token → skip
  if (s.enabled === false) return false;
  if (!s.token) return false;
  // notification_types: positive = subscribed; -2 often unsubscribed; null = unknown
  if (s.notification_types != null && Number(s.notification_types) <= 0) return false;
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
    const pushSubs = all.filter((s) => isWebPushSubscription(s) && isLikelySubscribed(s));
    // If strict filter finds nothing, still try any web-looking id (dashboard may show odd flags)
    const fallback = pushSubs.length
      ? pushSubs
      : all.filter((s) => isWebPushSubscription(s) && s.id);

    return {
      found: true,
      pushCount: fallback.length,
      subscriptionIds: fallback.map((s) => s.id).filter(Boolean),
      subscriptions: fallback.map((s) => ({
        id: s.id,
        type: s.type,
        enabled: s.enabled,
        notification_types: s.notification_types,
        hasToken: Boolean(s.token),
      })),
      allTypes: all.map((s) => ({
        id: s.id,
        type: s.type,
        enabled: s.enabled,
        notification_types: s.notification_types,
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
      "[onesignal] no web push subscription for user — log in as that user and Allow notifications",
      { externalId, userId: id, subInfo },
    );
    return { ok: false, skipped: true, reason: "no_subscription", externalId, subInfo };
  }

  const base = {
    app_id: appId,
    headings: { en: truncate(title || "Dialer", 50) || "Dialer" },
    contents: { en: truncate(body || "You have a new message", 120) || "You have a new message" },
    isAnyWeb: true,
  };
  if (url) base.url = String(url);

  try {
    // 1) Direct subscription IDs (most reliable for web push)
    let { res, json } = await postNotification({
      ...base,
      include_subscription_ids: subInfo.subscriptionIds,
    });

    // 2) Fallback: external_id alias targeting
    const aliasNeeded =
      !res.ok || !json?.id || json?.recipients === 0 || json?.errors;
    if (aliasNeeded) {
      console.warn("[onesignal] subscription_ids send weak, trying external_id alias", {
        status: res.status,
        externalId,
        subscriptionIds: subInfo.subscriptionIds,
        errors: json?.errors || null,
        recipients: json?.recipients ?? null,
      });
      ({ res, json } = await postNotification({
        ...base,
        target_channel: "push",
        include_aliases: { external_id: [externalId] },
      }));
    }

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
      console.warn("[onesignal] still 0 recipients after subscription_ids + alias", {
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
      via: aliasNeeded ? "alias_fallback" : "subscription_ids",
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
