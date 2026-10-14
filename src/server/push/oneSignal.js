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
    } catch {
      return null;
    }
  }
  return toOneSignalExternalId(id, username);
}

/** Subscribed web-push only (skip Unsubscribed / email / sms). */
function isSubscribedWebPush(s) {
  if (!s?.id) return false;
  if (s.enabled === false) return false;
  const type = String(s.type || "");
  if (/email|sms|iospush|androidpush|huawei|adm/i.test(type)) return false;
  const nt = Number(s.notification_types);
  return Number.isFinite(nt) && nt >= 1;
}

async function getSubscribedIds(externalId) {
  const appId = getOneSignalAppId();
  const apiKey = getOneSignalRestApiKey();
  if (!appId || !apiKey || !externalId) return [];

  const res = await fetch(
    `https://api.onesignal.com/apps/${encodeURIComponent(appId)}/users/by/external_id/${encodeURIComponent(externalId)}`,
    {
      headers: {
        Authorization: `Key ${apiKey}`,
        Accept: "application/json",
      },
    },
  );
  if (res.status === 404) return [];
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn("[onesignal] user lookup failed", res.status, json?.errors || json);
    return [];
  }
  const all = Array.isArray(json?.subscriptions) ? json.subscriptions : [];
  return all.filter(isSubscribedWebPush).map((s) => s.id).filter(Boolean);
}

/**
 * Send web push to every Subscribed device for this dialer user.
 * Uses subscription IDs (alias targeting often returns "No recipients").
 */
export async function sendPushToUser(userId, { title, body, url, username } = {}) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, skipped: true, reason: "invalid_user" };
  }

  const appId = getOneSignalAppId();
  const apiKey = getOneSignalRestApiKey();
  const auth = describeOneSignalAuth();

  if (!appId || !apiKey) {
    console.warn("[onesignal] not configured", auth);
    return { ok: false, skipped: true, reason: "not_configured", auth };
  }

  const externalId = await resolveExternalId(id, username);
  if (!externalId) {
    return { ok: false, skipped: true, reason: "invalid_user" };
  }

  let subscriptionIds = [];
  try {
    subscriptionIds = await getSubscribedIds(externalId);
  } catch (err) {
    console.warn("[onesignal] subscription lookup error", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }

  if (!subscriptionIds.length) {
    console.warn("[onesignal] no subscribed devices", { externalId, userId: id });
    return { ok: false, skipped: true, reason: "no_subscription", externalId };
  }

  try {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        include_subscription_ids: subscriptionIds,
        headings: { en: truncate(title || "Dialer", 50) || "Dialer" },
        contents: { en: truncate(body || "You have a new message", 120) || "You have a new message" },
        isAnyWeb: true,
        ...(url ? { url: String(url) } : {}),
      }),
    });
    const json = await res.json().catch(() => ({}));

    if (res.status === 401) {
      console.warn("[onesignal] 401 — REST key wrong (must be os_v2_app_…)", auth);
      return { ok: false, status: 401, reason: "invalid_api_key", auth, error: json };
    }

    if (!res.ok || !json?.id) {
      console.warn("[onesignal] send failed", { status: res.status, externalId, error: json });
      return { ok: false, status: res.status, error: json, externalId };
    }

    console.info("[onesignal] push sent", {
      externalId,
      userId: id,
      devices: subscriptionIds.length,
      id: json.id,
    });
    return {
      ok: true,
      id: json.id,
      externalId,
      subscriptionIds,
      pushSubscriptions: subscriptionIds.length,
    };
  } catch (err) {
    console.warn("[onesignal] send error", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

export function notifyOfflineMessage(userId, { title, body, conversationId } = {}) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;

  const base = getAppBaseUrl();
  const path =
    conversationId != null && Number(conversationId) > 0
      ? `/messages?c=${Number(conversationId)}`
      : "/messages";
  const url = base ? `${base}${path}` : path;

  console.info("[onesignal] message push enqueue", { userId: id, online: isUserOnline(id) });
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
