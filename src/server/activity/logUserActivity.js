import db from "@/server/db";
import { resolveRequestLocation } from "@/server/activity/resolveRequestLocation";

function headerValue(headers, name) {
  const raw = headers.get?.(name) ?? headers[name];
  if (raw == null || raw === "") return null;
  return String(raw).trim();
}

function requestUserAgent(req) {
  const userAgent = headerValue(req?.headers, "user-agent");
  return userAgent ? userAgent.slice(0, 512) : null;
}

export async function logUserActivity({
  req,
  userId = null,
  action,
  entityType = null,
  entityId = null,
  sessionId = null,
  metadata = null,
}) {
  if (!action) return null;

  try {
    const { ipAddress, latitude, longitude, country, region, city } =
      await resolveRequestLocation(req);

    return await db.UserActivity.create({
      userId,
      action,
      entityType,
      entityId,
      sessionId,
      ipAddress,
      latitude,
      longitude,
      country,
      region,
      city,
      userAgent: requestUserAgent(req),
      metadata,
    });
  } catch (err) {
    console.error("[logUserActivity]", action, err?.message || err);
    return null;
  }
}
