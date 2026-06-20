import db from "@/server/db";

function headerValue(headers, name) {
  const raw = headers.get?.(name) ?? headers[name];
  if (raw == null || raw === "") return null;
  return String(raw).trim();
}

function requestContext(req) {
  const headers = req?.headers;
  if (!headers) return { ipAddress: null, userAgent: null };

  const forwarded = headerValue(headers, "x-forwarded-for");
  const ipAddress =
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
    headerValue(headers, "x-real-ip") ||
    null;
  const userAgent = headerValue(headers, "user-agent");

  return {
    ipAddress,
    userAgent: userAgent ? userAgent.slice(0, 512) : null,
  };
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
    const { ipAddress, userAgent } = requestContext(req);

    return await db.UserActivity.create({
      userId,
      action,
      entityType,
      entityId,
      sessionId,
      ipAddress,
      userAgent,
      metadata,
    });
  } catch (err) {
    console.error("[logUserActivity]", action, err?.message || err);
    return null;
  }
}
