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

async function fetchUserPushSubscriptions(externalId) {
  const appId = getOneSignalAppId();
  const apiKey = getOneSignalRestApiKey();
  if (!appId || !apiKey || !externalId) {
    return { found: false, pushCount: 0, subscriptions: [], error: "not_configured" };
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
      return { found: false, pushCount: 0, subscriptions: [], error: "user_not_found" };
    }
    if (!res.ok) {
      return { found: false, pushCount: 0, subscriptions: [], error: json?.errors || json, status: res.status };
    }

    const subscriptions = Array.isArray(json?.subscriptions) ? json.subscriptions : [];
    const pushSubs = subscriptions.filter((s) => {
      const type = String(s?.type || "").toLowerCase();
      const isPush = type.includes("chrome") || type.includes("firefox") || type.includes("safari") || type.includes("push") || type === "web";
      const enabled = s?.enabled !== false;
      // notification_types > 0 means subscribed; negative often means unsubscribed
      const optedIn = s?.notification_types == null || Number(s.notification_types) > 0;
      return isPush && enabled && optedIn && s?.token;
    });

    return {
      found: true,
      pushCount: pushSubs.length,
      subscriptions: pushSubs.map((s) => ({
        id: s.id,
        type: s.type,
        enabled: s.enabled,
        notification_types: s.notification_types,
      })),
      onesignalId: json?.identity?.onesignal_id || null,
    };
  } catch (err) {
    return { found: false, pushCount: 0, subscriptions: [], error: err?.message || String(err) };
  }
}

/**
 * Send a web push to every subscription linked to this dialer userId (external_id).
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

  if (!authInfo.restApiKeyLooksValid) {
    console.warn("[onesignal] REST API key looks wrong", authInfo);
  }

  const externalId = await resolveExternalId(id, username);
  if (!externalId) {
    return { ok: false, skipped: true, reason: "invalid_user" };
  }

  const subInfo = await fetchUserPushSubscriptions(externalId);
  if (!subInfo.found || subInfo.pushCount === 0) {
    console.warn("[onesignal] no active web push subscription for user — they must Allow notifications while logged in", {
      externalId,
      userId: id,
      subInfo,
    });
    return {
      ok: false,
      skipped: true,
      reason: "no_subscription",
      externalId,
      subInfo,
    };
  }

  const payload = {
    app_id: appId,
    target_channel: "push",
    include_aliases: { external_id: [externalId] },
    isAnyWeb: true,
    headings: { en: truncate(title || "Dialer", 50) || "Dialer" },
    contents: { en: truncate(body || "You have a new message", 120) || "You have a new message" },
  };
  if (url) payload.url = String(url);

  try {
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

    if (res.status === 401) {
      console.warn("[onesignal] 401 — invalid REST API key", {
        ...authInfo,
        hint:
          authInfo.hint ||
          "Create/rotate App API key in OneSignal → Settings → Keys & IDs. Paste the os_v2_app_… value into Railway ONESIGNAL_REST_API_KEY with no quotes, then redeploy.",
      });
      return { ok: false, status: 401, reason: "invalid_api_key", externalId, auth: authInfo, error: json };
    }

    if (!res.ok) {
      console.warn("[onesignal] send failed", {
        status: res.status,
        externalId,
        userId: id,
        errors: json?.errors || json,
      });
      return { ok: false, status: res.status, error: json, externalId };
    }

    // Newer OneSignal responses often omit `recipients` (null). An `id` means accepted.
    if (!json?.id) {
      console.warn("[onesignal] accepted request but no message id", {
        externalId,
        userId: id,
        response: json,
        subInfo,
      });
      return { ok: false, skipped: true, reason: "no_message_id", externalId, response: json, subInfo };
    }

    if (json.recipients === 0) {
      console.warn("[onesignal] 0 recipients despite subscription lookup", {
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
      recipients: json.recipients ?? "n/a",
      pushSubscriptions: subInfo.pushCount,
      id: json.id,
    });
    return {
      ok: true,
      id: json.id,
      recipients: json.recipients ?? null,
      externalId,
      pushSubscriptions: subInfo.pushCount,
    };
  } catch (err) {
    console.warn("[onesignal] send error", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Push on new message (all registered devices for that user).
 */
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
