/**
 * Infer device class from User-Agent (best-effort; not cryptographically reliable).
 */
export function resolveDeviceTypeFromUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== "string") {
    return { deviceType: "unknown", deviceLabel: "Unknown" };
  }

  const ua = userAgent;

  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) {
    return { deviceType: "tablet", deviceLabel: "Tablet" };
  }

  if (/Mobile|iPhone|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return { deviceType: "mobile", deviceLabel: "Mobile" };
  }

  return { deviceType: "desktop", deviceLabel: "Desktop" };
}

export function deviceLabelForType(deviceType) {
  if (deviceType === "mobile") return "Mobile";
  if (deviceType === "desktop") return "Desktop";
  if (deviceType === "tablet") return "Tablet";
  return "Unknown";
}

export function resolveDeviceTypeFromRequest(req) {
  const raw = req?.headers?.get?.("user-agent") ?? req?.headers?.["user-agent"];
  const userAgent = raw != null ? String(raw).trim() : "";
  return resolveDeviceTypeFromUserAgent(userAgent);
}

/** Only desktop app logins count toward attendance; mobile/tablet stay in UserActivity only. */
export function isDesktopAttendanceLogin(device) {
  return device?.deviceType === "desktop";
}
