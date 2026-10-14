import { isUserOnline } from "@/server/socketHub";

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

/**
 * Send a web push to every subscription linked to this dialer userId (external_id).
 * Fire-and-forget safe: never throws to callers.
 */
export async function sendPushToUser(userId, { title, body, url } = {}) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, skipped: true, reason: "invalid_user" };
  }

  const appId = getAppId();
  const apiKey = getRestApiKey();
  if (!appId || !apiKey) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }

  const payload = {
    app_id: appId,
    target_channel: "push",
    include_aliases: { external_id: [String(id)] },
    headings: { en: truncate(title || "Dialer", 50) || "Dialer" },
    contents: { en: truncate(body || "You have a new message", 120) || "You have a new message" },
  };

  if (url) {
    payload.url = String(url);
  }

  try {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn("[onesignal] send failed", res.status, json?.errors || json);
      return { ok: false, status: res.status, error: json };
    }
    return { ok: true, id: json?.id || null, recipients: json?.recipients ?? null };
  } catch (err) {
    console.warn("[onesignal] send error", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * If the recipient has no active dialer socket, push to all their registered browsers.
 */
export function notifyOfflineMessage(userId, { title, body, conversationId } = {}) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  if (isUserOnline(id)) return;

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
  if (!body) {
    body = hasAttachments ? "Sent an attachment" : "You have a new message";
  }
  return { title, body };
}
