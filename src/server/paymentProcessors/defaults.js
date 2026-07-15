/** Seed / fallback payment gateways when the DB table is empty or unavailable. */
export const PAYMENT_PROCESSOR_SEEDS = [
  { code: "auth", fullName: "Auth", shortCode: "PA", tone: "indigo", sortOrder: 10 },
  { code: "kurv", fullName: "Kurv", shortCode: "PC", tone: "teal", sortOrder: 20 },
  { code: "cardpointe", fullName: "Cardpointe", shortCode: "CP", tone: "sky", sortOrder: 30 },
];

export function slugifyProcessorCode(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}
