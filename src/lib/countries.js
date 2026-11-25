export const COUNTRY_USA = "usa";
export const COUNTRY_CANADA = "canada";

const COUNTRY_VALUES = new Set([COUNTRY_USA, COUNTRY_CANADA]);
const ACCESS_VALUES = new Set([COUNTRY_USA, COUNTRY_CANADA, "both"]);

/** @param {unknown} value */
export function normalizeCountry(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return COUNTRY_VALUES.has(normalized) ? normalized : null;
}

/** @param {unknown} value @returns {"usa" | "canada" | "both" | null} */
export function parseCountryAccess(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ACCESS_VALUES.has(normalized) ? normalized : null;
}

/** Missing or unknown access is USA. Admins are forced to both by the caller. */
export function normalizeCountryAccess(value) {
  return parseCountryAccess(value) || COUNTRY_USA;
}

export function countryAccessLabel(access) {
  if (access === "both") return "Both";
  if (access === COUNTRY_CANADA) return "Canada";
  return "USA";
}

export function flagsFromCountryAccess(access) {
  if (access === COUNTRY_CANADA) return { usa: false, canada: true };
  if (access === "both") return { usa: true, canada: true };
  return { usa: true, canada: false };
}

export function countryAccessFromFlags(usa, canada) {
  if (usa && canada) return "both";
  if (canada) return COUNTRY_CANADA;
  if (usa) return COUNTRY_USA;
  return null;
}

/** @param {"usa" | "canada" | "both"} access */
export function countriesForAccess(access) {
  if (access === COUNTRY_USA) return [COUNTRY_USA];
  if (access === COUNTRY_CANADA) return [COUNTRY_CANADA];
  return [COUNTRY_USA, COUNTRY_CANADA];
}

export function allowedCountriesForUser(user) {
  if (user?.role === "admin") return [COUNTRY_USA, COUNTRY_CANADA];
  return countriesForAccess(normalizeCountryAccess(user?.countryAccess));
}

/** Missing country falls back to the user's first allowed country. */
export function resolveUserCountry(user, raw) {
  const allowed = allowedCountriesForUser(user);
  const requested = normalizeCountry(raw);
  if (!requested) return { country: allowed[0] };
  if (!allowed.includes(requested)) return { error: "Country is not allowed" };
  return { country: requested };
}
