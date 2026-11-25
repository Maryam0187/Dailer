/** Canadian provinces and territories with a primary IANA timezone. */
export const CA_PROVINCES = [
  { code: "AB", name: "Alberta", timeZone: "America/Edmonton" },
  { code: "BC", name: "British Columbia", timeZone: "America/Vancouver" },
  { code: "MB", name: "Manitoba", timeZone: "America/Winnipeg" },
  { code: "NB", name: "New Brunswick", timeZone: "America/Moncton" },
  { code: "NL", name: "Newfoundland and Labrador", timeZone: "America/St_Johns" },
  { code: "NS", name: "Nova Scotia", timeZone: "America/Halifax" },
  { code: "NT", name: "Northwest Territories", timeZone: "America/Yellowknife" },
  { code: "NU", name: "Nunavut", timeZone: "America/Iqaluit" },
  { code: "ON", name: "Ontario", timeZone: "America/Toronto" },
  { code: "PE", name: "Prince Edward Island", timeZone: "America/Halifax" },
  { code: "QC", name: "Quebec", timeZone: "America/Toronto" },
  { code: "SK", name: "Saskatchewan", timeZone: "America/Regina" },
  { code: "YT", name: "Yukon", timeZone: "America/Whitehorse" },
];

const byCode = new Map(CA_PROVINCES.map((province) => [province.code, province]));

export function getProvinceByCode(code) {
  return byCode.get(String(code || "").trim().toUpperCase()) || null;
}

/** Display A1A 1A1. Letters and digits only, max 6. */
export function formatCanadianPostal(value) {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  if (raw.length <= 3) return raw;
  return `${raw.slice(0, 3)} ${raw.slice(3)}`;
}

/** Empty is allowed. A typed value must be a full postal code. */
export function validateCanadianPostal(value) {
  if (!String(value || "").trim()) return { isValid: true, message: "" };
  if (!/^[A-Z]\d[A-Z] \d[A-Z]\d$/.test(formatCanadianPostal(value))) {
    return { isValid: false, message: "Enter a postal code like A1A 1A1" };
  }
  return { isValid: true, message: "" };
}
