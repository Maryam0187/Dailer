const lookupCache = new Map();
const geocodeCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

const NOMINATIM_USER_AGENT =
  process.env.NOMINATIM_USER_AGENT || "DialerApp/1.0 (activity logging)";

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

function locationFromHeaders(headers) {
  const country =
    headerValue(headers, "cf-ipcountry") ||
    headerValue(headers, "x-vercel-ip-country") ||
    headerValue(headers, "cloudfront-viewer-country") ||
    null;

  const region =
    headerValue(headers, "x-vercel-ip-country-region") ||
    headerValue(headers, "cloudfront-viewer-country-region") ||
    null;

  const city =
    headerValue(headers, "x-vercel-ip-city") ||
    headerValue(headers, "cf-ipcity") ||
    null;

  if (!country && !region && !city) return null;

  return {
    area: null,
    country: trimField(country, 64),
    region: trimField(region, 128),
    city: trimField(city, 128),
  };
}

function mergeLocations(...locations) {
  const merged = { area: null, country: null, region: null, city: null };
  for (const loc of locations) {
    if (!loc) continue;
    if (!merged.area && loc.area) merged.area = loc.area;
    if (!merged.city && loc.city) merged.city = loc.city;
    if (!merged.region && loc.region) merged.region = loc.region;
    if (!merged.country && loc.country) merged.country = loc.country;
  }
  if (!merged.area && !merged.city && !merged.region && !merged.country) return null;
  return merged;
}

function pickAreaFromAddress(address, city) {
  if (!address || typeof address !== "object") return null;
  const cityLower = String(city || "").trim().toLowerCase();
  const candidates = [
    address.suburb,
    address.neighbourhood,
    address.quarter,
    address.city_district,
    address.borough,
    address.district,
    address.ward,
    address.town,
    address.village,
  ];
  for (const value of candidates) {
    const label = trimField(value, 128);
    if (!label) continue;
    if (cityLower && label.toLowerCase() === cityLower) continue;
    return label;
  }
  return null;
}

async function reverseGeocodeArea(lat, lon, city) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: "json",
      addressdetails: "1",
      zoom: "14",
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      signal: AbortSignal.timeout(4000),
      headers: {
        "User-Agent": NOMINATIM_USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;

    const json = await res.json().catch(() => null);
    const area = pickAreaFromAddress(json?.address, city);
    geocodeCache.set(cacheKey, { at: Date.now(), data: area });
    return area;
  } catch {
    return null;
  }
}

async function lookupIpLocation(ip) {
  if (isPrivateOrLocalIp(ip)) return null;

  const cached = lookupCache.get(ip);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const fields = [
      "status",
      "country",
      "regionName",
      "city",
      "district",
      "zip",
      "lat",
      "lon",
    ].join(",");
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${fields}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;

    const json = await res.json().catch(() => null);
    if (!json || json.status !== "success") return null;

    const city = trimField(json.city, 128);
    let area = trimField(json.district, 128);

    if (!area && Number.isFinite(json.lat) && Number.isFinite(json.lon)) {
      area = await reverseGeocodeArea(json.lat, json.lon, city);
    }

    const data = {
      area,
      country: trimField(json.country, 64),
      region: trimField(json.regionName, 128),
      city,
    };

    lookupCache.set(ip, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

/**
 * Approximate location from proxy headers, IP geolocation, and reverse geocoding.
 * Area/suburb is best-effort — IP location is never exact like GPS.
 */
export async function resolveRequestLocation(req) {
  const headers = req?.headers;
  const ipAddress = extractClientIp(headers);
  const headerLocation = headers ? locationFromHeaders(headers) : null;
  const ipLocation = ipAddress ? await lookupIpLocation(ipAddress) : null;
  const merged = mergeLocations(ipLocation, headerLocation);

  return {
    ipAddress,
    area: merged?.area ?? null,
    country: merged?.country ?? null,
    region: merged?.region ?? null,
    city: merged?.city ?? null,
  };
}

export function formatLocationLabel({ area, city, region, country } = {}) {
  const parts = [area, city, region, country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}
