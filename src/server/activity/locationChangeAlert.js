import { formatLocationLabel } from "@/server/activity/resolveRequestLocation";

const DEFAULT_DISTANCE_KM = 50;

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function locationSnapshot(row) {
  return {
    ipAddress: normalizeText(row?.ipAddress),
    latitude: parseNumber(row?.latitude),
    longitude: parseNumber(row?.longitude),
    country: normalizeText(row?.country),
    region: normalizeText(row?.region),
    city: normalizeText(row?.city),
  };
}

function formatLocationBlock(label, location) {
  const coords = formatLocationLabel(location);
  const lines = [`${label}:`];
  if (coords) lines.push(`  Coordinates: ${coords}`);
  if (location.city || location.region || location.country) {
    lines.push(
      `  Place: ${[location.city, location.region, location.country].filter(Boolean).join(", ")}`,
    );
  }
  if (location.ipAddress) lines.push(`  IP: ${location.ipAddress}`);
  if (lines.length === 1) lines.push("  (unknown)");
  return lines.join("\n");
}

export function hasLocationChanged(previous, current) {
  const prev = locationSnapshot(previous);
  const next = locationSnapshot(current);

  if (prev.country && next.country && prev.country !== next.country) return true;
  if (prev.city && next.city && prev.city !== next.city) return true;

  if (
    prev.latitude != null &&
    prev.longitude != null &&
    next.latitude != null &&
    next.longitude != null
  ) {
    const thresholdKm = parseNumber(process.env.LOCATION_CHANGE_KM) ?? DEFAULT_DISTANCE_KM;
    return distanceKm(prev.latitude, prev.longitude, next.latitude, next.longitude) > thresholdKm;
  }

  if (prev.ipAddress && next.ipAddress && prev.ipAddress !== next.ipAddress) {
    return true;
  }

  return false;
}

/** Payload for browser Web3Forms submit when login location changed. */
export function buildLocationChangeAlert({ userId, username, previous, current }) {
  if (process.env.LOCATION_ALERT_ENABLED === "false") return null;
  if (!previous || !hasLocationChanged(previous, current)) return null;

  const prev = locationSnapshot(previous);
  const next = locationSnapshot(current);
  const displayName = username || `User #${userId}`;
  const when = new Date().toLocaleString();
  const mapsUrl =
    next.latitude != null && next.longitude != null
      ? `https://www.google.com/maps?q=${next.latitude},${next.longitude}`
      : null;

  const message = [
    `User "${displayName}" (ID ${userId}) signed in from a different location.`,
    "",
    `Time: ${when}`,
    "",
    formatLocationBlock("Previous login", prev),
    "",
    formatLocationBlock("New login", next),
    mapsUrl ? `\nMap: ${mapsUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `Dialer alert: location change for ${displayName}`,
    message,
    replyTo: process.env.ADMIN_ALERT_EMAIL || null,
  };
}
