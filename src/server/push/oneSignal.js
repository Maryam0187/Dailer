import db from "@/server/db";
import { toOneSignalExternalId } from "@/lib/oneSignalExternalId";
import {
  describeOneSignalAuth,
  getOneSignalAppId,
  getOneSignalRestApiKey,
} from "@/server/push/oneSignalEnv";
import { isUserInQuietHours } from "@/server/push/notificationSchedule";

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
    subscribed: Number.isFinite(nt) && nt >= 1 && s.enabled !== false,
    hasToken: Boolean(s.token),
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
    console.warn("[onesignal] user lookup failed", res.status);
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

/** Admin: devices for many dialer users (sequential to avoid rate limits). */
export async function listPushDevicesForUsers(users) {
  const out = [];
  for (const u of users) {
    const externalId = toOneSignalExternalId(u.id, u.username);
    const listed = externalId
      ? await listPushDevicesForExternalId(externalId)
      : { ok: false, devices: [], subscribedCount: 0 };
    out.push({
      userId: u.id,
      username: u.username,
      role: u.role,
      active: u.active !== false,
      externalId,
      onesignalId: listed.onesignalId || null,
      found: Boolean(listed.found),
      subscribedCount: listed.subscribedCount || 0,
      devices: listed.devices || [],
    });
  }
  return out;
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
    console.warn("[onesignal] delete subscription failed", res.status);
    return { ok: false, reason: "delete_failed", status: res.status };
  }
  return { ok: true, subscriptionId: subId };
}

async function getSubscribedIds(externalId) {
  const listed = await listPushDevicesForExternalId(externalId);
  if (!listed.ok) return [];
  return listed.devices.filter((d) => d.subscribed && d.id).map((d) => d.id);
}

/**
 * Send web push to every Subscribed device for this dialer user.
 * ONLY include_subscription_ids — do not mix isAnyWeb (causes "No recipients").
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
    return { ok: false, skipped: true, reason: "no_subscription", externalId };
  }

  try {
    const payload = {
      app_id: appId,
      include_subscription_ids: subscriptionIds,
      target_channel: "push",
      headings: { en: truncate(title || "Dialer", 50) || "Dialer" },
      contents: {
        en: truncate(body || "You have a new message", 120) || "You have a new message",
      },
    };
    if (url) payload.url = String(url);

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
      console.warn("[onesignal] 401 — REST key wrong", auth);
      return { ok: false, status: 401, reason: "invalid_api_key", auth, error: json };
    }

    const messageId = typeof json?.id === "string" ? json.id.trim() : "";
    const recipients = Number(json?.recipients);
    const noRecipients =
      !messageId ||
      recipients === 0 ||
      (Array.isArray(json?.errors) &&
        json.errors.some((e) => /not subscribed|no.*recipient|no.*subscriber/i.test(String(e))));

    if (!res.ok || noRecipients) {
      console.warn("[onesignal] send failed", { status: res.status, externalId, error: json?.errors || json });
      return {
        ok: false,
        status: res.status,
        reason: messageId && recipients === 0 ? "no_recipients" : "send_failed",
        error: json,
        externalId,
        subscriptionIds,
      };
    }

    return {
      ok: true,
      id: messageId,
      recipients: json.recipients ?? null,
      externalId,
      subscriptionIds,
      pushSubscriptions: subscriptionIds.length,
    };
  } catch (err) {
    console.warn("[onesignal] send error", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Enqueue push for a message. Skips when recipient is in quiet hours unless notifyAnyway.
 */
export function notifyOfflineMessage(
  userId,
  { title, body, conversationId, notifyAnyway = false } = {},
) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;

  const base = getAppBaseUrl();
  const path =
    conversationId != null && Number(conversationId) > 0
      ? `/messages?c=${Number(conversationId)}`
      : "/messages";
  const url = base ? `${base}${path}` : path;

  void (async () => {
    if (!notifyAnyway) {
      try {
        if (await isUserInQuietHours(id)) {
          return;
        }
      } catch {
        /* send if schedule check fails */
      }
    }
    void sendPushToUser(id, { title, body, url });
  })();
}

export function buildMessagePushCopy({ senderName, messageBody, hasAttachments = false } = {}) {
  const title = truncate(senderName || "New message", 50) || "New message";
  let body = truncate(messageBody, 120);
  if (!body) body = hasAttachments ? "Sent an attachment" : "You have a new message";
  return { title, body };
}
