import db from "@/server/db";
import { resolveRequestLocation } from "@/server/activity/resolveRequestLocation";
import { buildLocationChangeAlert } from "@/server/activity/locationChangeAlert";

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
  if (!action) return { activity: null, locationAlert: null };

  try {
    const { ipAddress, latitude, longitude, country, region, city } =
      await resolveRequestLocation(req);

    let previousLogin = null;
    if (action === "login_success" && userId) {
      previousLogin = await db.UserActivity.findOne({
        where: { userId, action: "login_success" },
        order: [["createdAt", "DESC"]],
        attributes: [
          "ipAddress",
          "latitude",
          "longitude",
          "country",
          "region",
          "city",
          "createdAt",
        ],
      });
    }

    const activity = await db.UserActivity.create({
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

    let locationAlert = null;
    if (action === "login_success" && userId && previousLogin) {
      locationAlert = buildLocationChangeAlert({
        userId,
        username: metadata?.username,
        previous: previousLogin,
        current: { ipAddress, latitude, longitude, country, region, city },
      });
    }

    return { activity, locationAlert };
  } catch (err) {
    console.error("[logUserActivity]", action, err?.message || err);
    return { activity: null, locationAlert: null };
  }
}
