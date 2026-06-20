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
    country: country ? country.slice(0, 64) : null,
    region: region ? region.slice(0, 128) : null,
    city: city ? city.slice(0, 128) : null,
  };
}

function hasNamedLocation(location) {
  return Boolean(location?.city || location?.region || location?.country);
}

function mergeLocations(primary, fallback) {
  if (!primary && !fallback) return null;
  return {
    country: primary?.country || fallback?.country || null,
    region: primary?.region || fallback?.region || null,
    city: primary?.city || fallback?.city || null,
  };
}

async function lookupIpLocation(ip) {
  if (isPrivateOrLocalIp(ip)) return null;

  const cached = lookupCache.get(ip);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;

    const json = await res.json().catch(() => null);
    if (!json || json.status !== "success") return null;

    const data = {
      country: json.country ? String(json.country).slice(0, 64) : null,
      region: json.regionName ? String(json.regionName).slice(0, 128) : null,
      city: json.city ? String(json.city).slice(0, 128) : null,
    };

    lookupCache.set(ip, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

/**
 * Approximate location from proxy headers and IP geolocation lookup.
 * Returns city/region/country names when available (not lat/lng).
 */
export async function resolveRequestLocation(req) {
  const headers = req?.headers;
  const ipAddress = extractClientIp(headers);
  const headerLocation = headers ? locationFromHeaders(headers) : null;

  if (hasNamedLocation(headerLocation) && headerLocation.city) {
    return {
      ipAddress,
      country: headerLocation.country,
      region: headerLocation.region,
      city: headerLocation.city,
    };
  }

  const ipLocation = ipAddress ? await lookupIpLocation(ipAddress) : null;
  const merged = mergeLocations(ipLocation, headerLocation);

  return {
    ipAddress,
    country: merged?.country ?? null,
    region: merged?.region ?? null,
    city: merged?.city ?? null,
  };
}

export function formatLocationLabel({ city, region, country } = {}) {
  const parts = [city, region, country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}
