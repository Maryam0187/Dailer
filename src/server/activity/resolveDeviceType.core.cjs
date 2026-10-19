"use strict";

/**
 * Infer device class from User-Agent (best-effort; not cryptographically reliable).
 * CommonJS twin of resolveDeviceType.js for the custom Node server / online-time boot.
 */
function resolveDeviceTypeFromUserAgent(userAgent) {
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

/**
 * Bucket for online-time accounting: tablet/mobile → mobile; everything else → desktop.
 * @returns {"desktop"|"mobile"}
 */
function onlineTimeDeviceBucket(deviceType) {
  if (deviceType === "mobile" || deviceType === "tablet") return "mobile";
  return "desktop";
}

function resolveOnlineTimeDeviceBucketFromUserAgent(userAgent) {
  const { deviceType } = resolveDeviceTypeFromUserAgent(userAgent);
  return onlineTimeDeviceBucket(deviceType);
}

module.exports = {
  resolveDeviceTypeFromUserAgent,
  onlineTimeDeviceBucket,
  resolveOnlineTimeDeviceBucketFromUserAgent,
};
