import db from "@/server/db";
import { isUserOnline } from "@/server/socketHub";
import { toOneSignalExternalId } from "@/lib/oneSignalExternalId";

function getAppId() {
  return String(
    process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "",
  ).trim();
}

function getRestApiKey() {
  return String(process.env.ONESIGNAL_REST_API_KEY || "").trim();
}

function getAppBaseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.TWILIO_WEBHOOK_BASE_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    "";
  let base = String(raw).trim().replace(/\/$/, "");
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

/**
 * Send a web push to every subscription linked to this dialer userId (external_id).
 * Fire-and-forget safe: never throws to callers.
 */
export async function sendPushToUser(userId, { title, body, url, username } = {}) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, skipped: true, reason: "invalid_user" };
  }

  const appId = getAppId();
  const apiKey = getRestApiKey();
  if (!appId || !apiKey) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }

  const externalId = await resolveExternalId(id, username);
  if (!externalId) {
    return { ok: false, skipped: true, reason: "invalid_user" };
  }

  const basePayload = {
    app_id: appId,
    headings: { en: truncate(title || "Dialer", 50) || "Dialer" },
    contents: { en: truncate(body || "You have a new message", 120) || "You have a new message" },
    isAnyWeb: true,
  };
  if (url) basePayload.url = String(url);

  async function postNotification(payload) {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  }

  try {
    // User Model targeting
    let { res, json } = await postNotification({
      ...basePayload,
      target_channel: "push",
      include_aliases: { external_id: [externalId] },
    });

    // Fallback for apps still on classic External User Ids targeting
    if (!res.ok || !json?.id || json?.recipients === 0) {
      console.warn("[onesignal] aliases send weak/failed, retrying include_external_user_ids", {
        status: res.status,
        externalId,
        userId: id,
        errors: json?.errors || null,
        recipients: json?.recipients ?? null,
      });
      ({ res, json } = await postNotification({
        ...basePayload,
        include_external_user_ids: [externalId],
        channel_for_external_user_ids: "push",
      }));
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
    const recipients = json?.recipients ?? null;
    if (!json?.id || recipients === 0) {
      console.warn("[onesignal] send reached API but 0 recipients — check External ID in OneSignal", {
        externalId,
        userId: id,
        response: json,
      });
      return { ok: false, skipped: true, reason: "no_recipients", externalId, response: json };
    }
    console.info("[onesignal] push sent", { externalId, userId: id, recipients, id: json.id });
    return { ok: true, id: json.id, recipients, externalId };
  } catch (err) {
    console.warn("[onesignal] send error", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Push a new-message alert to the recipient's registered browsers.
 *
 * Presence sockets stay up in background tabs, so "online" used to skip push
 * exactly when the user was away from the dialer UI. We only skip when the
 * REST key/app is missing; live tabs still get Socket.IO as well.
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
