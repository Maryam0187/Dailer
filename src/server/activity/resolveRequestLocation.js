const lookupCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

function headerValue(headers, name) {
  const raw = headers.get?.(name) ?? headers[name];
  if (raw == null || raw === "") return null;
  return String(raw).trim();
}

function firstForwardedIp(forwarded) {
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

function extractClientIp(headers) {
  if (!headers) return null;
  return (
    firstForwardedIp(headerValue(headers, "x-forwarded-for")) ||
    headerValue(headers, "x-real-ip") ||
    headerValue(headers, "cf-connecting-ip") ||
    null
  );
}

function isPrivateOrLocalIp(ip) {
  if (!ip) return true;
  if (ip === "::1" || ip.startsWith("fe80:")) return true;
  if (ip.includes(":")) return false;
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  return false;
}

function trimField(value, maxLen) {
  if (value == null || value === "") return null;
  return String(value).trim().slice(0, maxLen) || null;
}

function parseCoordinate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

async function lookupIpLocation(ip) {
  if (isPrivateOrLocalIp(ip)) return null;

  const cached = lookupCache.get(ip);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const fields = ["status", "country", "regionName", "city", "lat", "lon"].join(",");
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${fields}&lang=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;

    const json = await res.json().catch(() => null);
    if (!json || json.status !== "success") return null;

    const data = {
      latitude: parseCoordinate(json.lat),
      longitude: parseCoordinate(json.lon),
      country: trimField(json.country, 64),
      region: trimField(json.regionName, 128),
      city: trimField(json.city, 128),
    };

    lookupCache.set(ip, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

/**
 * Approximate location from IP geolocation (lat/lng + English place names).
 * IP-based — not GPS-precise.
 */
export async function resolveRequestLocation(req) {
  const headers = req?.headers;
  const ipAddress = extractClientIp(headers);
  const ipLocation = ipAddress ? await lookupIpLocation(ipAddress) : null;

  return {
    ipAddress,
    latitude: ipLocation?.latitude ?? null,
    longitude: ipLocation?.longitude ?? null,
    country: ipLocation?.country ?? null,
    region: ipLocation?.region ?? null,
    city: ipLocation?.city ?? null,
  };
}

/** Place names for UI display (coordinates are stored separately). */
export function formatLocationLabel({ city, region, country } = {}) {
  const parts = [city, region, country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Place name plus coordinates for tooltips (coordinates still stored in DB). */
export function formatLocationTitle({ latitude, longitude, city, region, country } = {}) {
  const place = [city, region, country].filter(Boolean).join(", ");
  const lat = latitude != null ? Number(latitude) : null;
  const lng = longitude != null ? Number(longitude) : null;
  const coords =
    Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : null;

  if (place && coords) return `${place} (${coords})`;
  return place || coords || null;
}
