import db from "@/server/db";
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
  if (base && !/^https?:\/\//i.test(base)) base = `https://${base}`;
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

function summarizeSubscription(s) {
  const nt = Number(s.notification_types);
  const subscribed = Number.isFinite(nt) && nt >= 1 && s.enabled !== false;
  const type = String(s.type || "web");
  return {
    id: s.id,
    type,
    label: /chrome/i.test(type)
      ? "Chrome"
      : /firefox/i.test(type)
        ? "Firefox"
        : /safari/i.test(type)
          ? "Safari"
          : /edge/i.test(type)
            ? "Edge"
            : type || "Web",
    subscribed,
    enabled: s.enabled !== false,
    notification_types: s.notification_types ?? null,
    device_os: s.device_os || null,
    device_model: s.device_model || null,
    last_active: s.last_active || s.updated_at || s.created_at || null,
    session_count: s.session_count ?? null,
  };
}

function isWebPushChannel(s) {
  if (!s?.id) return false;
  const type = String(s.type || "");
  if (/email|sms|iospush|androidpush|huawei|adm/i.test(type)) return false;
  return true;
}

/** All web-push subscriptions for External ID (subscribed + unsubscribed). */
export async function listPushDevicesForExternalId(externalId) {
  const appId = getOneSignalAppId();
  const apiKey = getOneSignalRestApiKey();
  if (!appId || !apiKey || !externalId) {
    return { ok: false, reason: "not_configured", devices: [] };
  }

  const res = await fetch(
    `https://api.onesignal.com/apps/${encodeURIComponent(appId)}/users/by/external_id/${encodeURIComponent(externalId)}`,
    { headers: { Authorization: `Key ${apiKey}`, Accept: "application/json" } },
  );
  if (res.status === 404) {
    return { ok: true, found: false, externalId, devices: [] };
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn("[onesignal] user lookup failed", res.status, json?.errors || json);
    return { ok: false, reason: "lookup_failed", status: res.status, devices: [] };
  }

  const all = Array.isArray(json?.subscriptions) ? json.subscriptions : [];
  const devices = all.filter(isWebPushChannel).map(summarizeSubscription);
  devices.sort((a, b) => {
    if (a.subscribed !== b.subscribed) return a.subscribed ? -1 : 1;
    const ta = Date.parse(a.last_active || 0) || 0;
    const tb = Date.parse(b.last_active || 0) || 0;
    return tb - ta;
  });

  return {
    ok: true,
    found: true,
    externalId,
    onesignalId: json?.identity?.onesignal_id || null,
    devices,
    subscribedCount: devices.filter((d) => d.subscribed).length,
  };
}

export async function listPushDevicesForUser(userId, usernameHint = null) {
  const externalId = await resolveExternalId(userId, usernameHint);
  if (!externalId) return { ok: false, reason: "invalid_user", devices: [] };
  return listPushDevicesForExternalId(externalId);
}

async function mapPool(items, concurrency, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await mapper(items[i], i);
    }
  }
  const n = Math.min(concurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * Admin: list push devices for every dialer user (batched OneSignal lookups).
 */
export async function listPushDevicesForAllUsers({ activeOnly = true } = {}) {
  const where = activeOnly ? { isActive: true } : {};
  const users = await db.User.findAll({
    where,
    attributes: ["id", "username", "role", "isActive"],
    order: [["username", "ASC"]],
  });

  const rows = await mapPool(users, 6, async (user) => {
    const listed = await listPushDevicesForUser(user.id, user.username);
    return {
      userId: user.id,
      username: user.username,
      role: user.role,
      isActive: Boolean(user.isActive),
      externalId: listed.externalId || toOneSignalExternalId(user.id, user.username),
      onesignalId: listed.onesignalId || null,
      found: Boolean(listed.found),
      subscribedCount: listed.subscribedCount ?? 0,
      deviceCount: Array.isArray(listed.devices) ? listed.devices.length : 0,
      devices: listed.devices || [],
      ok: listed.ok !== false,
    };
  });

  const subscribedUsers = rows.filter((r) => r.subscribedCount > 0).length;
  const totalDevices = rows.reduce((sum, r) => sum + r.deviceCount, 0);
  const totalSubscribed = rows.reduce((sum, r) => sum + r.subscribedCount, 0);

  return {
    ok: true,
    users: rows,
    summary: {
      userCount: rows.length,
      subscribedUsers,
      totalDevices,
      totalSubscribed,
    },
  };
}

/** Delete one subscription (must belong to this External ID). */
export async function deletePushSubscription(externalId, subscriptionId) {
  const appId = getOneSignalAppId();
  const apiKey = getOneSignalRestApiKey();
  const subId = String(subscriptionId || "").trim();
  if (!appId || !apiKey || !externalId || !subId) {
    return { ok: false, reason: "not_configured" };
  }

  const listed = await listPushDevicesForExternalId(externalId);
  if (!listed.ok) return { ok: false, reason: listed.reason || "lookup_failed" };
  if (!listed.devices.some((d) => d.id === subId)) {
    return { ok: false, reason: "not_found" };
  }

  const res = await fetch(
    `https://api.onesignal.com/apps/${encodeURIComponent(appId)}/subscriptions/${encodeURIComponent(subId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Key ${apiKey}`, Accept: "application/json" },
    },
  );
  if (res.status !== 202 && res.status !== 200 && res.status !== 204) {
    const json = await res.json().catch(() => ({}));
    console.warn("[onesignal] delete subscription failed", res.status, json);
    return { ok: false, reason: "delete_failed", status: res.status, error: json };
  }
  return { ok: true, subscriptionId: subId };
}

async function getSubscribedIds(externalId) {
  const listed = await listPushDevicesForExternalId(externalId);
  if (!listed.ok) return [];
  return listed.devices.filter((d) => d.subscribed).map((d) => d.id);
}

/**
 * Send web push to every Subscribed device for this dialer user.
 * Uses include_subscription_ids (aliases often return "No recipients").
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
    return { ok: false, error: err?.message || String(err), externalId };
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
        contents: {
          en: truncate(body || "You have a new message", 120) || "You have a new message",
        },
        isAnyWeb: true,
        ...(url ? { url: String(url) } : {}),
      }),
    });
    const json = await res.json().catch(() => ({}));

    if (res.status === 401) {
      console.warn("[onesignal] 401 — REST key wrong", auth);
      return { ok: false, status: 401, reason: "invalid_api_key", auth, error: json };
    }
    if (!res.ok || !json?.id) {
      console.warn("[onesignal] send failed", { status: res.status, externalId, error: json });
      return { ok: false, status: res.status, error: json, externalId };
    }

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

  void sendPushToUser(id, { title, body, url });
}

export function buildMessagePushCopy({ senderName, messageBody, hasAttachments = false } = {}) {
  const title = truncate(senderName || "New message", 50) || "New message";
  let body = truncate(messageBody, 120);
  if (!body) body = hasAttachments ? "Sent an attachment" : "You have a new message";
  return { title, body };
}
