import { normalizeToE164 } from "@/server/calls/normalizePhone";

/** Small exact phone variant set for cheap IN queries (no LIKE). */
export function phoneVariants(raw) {
  const input = String(raw || "").trim();
  if (!input) return [];

  const e164 = normalizeToE164(input);
  const digits = input.replace(/\D/g, "");
  const variants = new Set();

  if (e164) {
    variants.add(e164);
    variants.add(e164.replace(/^\+/, ""));
  }
  if (digits) {
    variants.add(digits);
    if (digits.length === 10) {
      variants.add(`+1${digits}`);
      variants.add(`1${digits}`);
    }
    if (digits.length === 11 && digits.startsWith("1")) {
      variants.add(`+${digits}`);
      variants.add(digits.slice(1));
    }
    if (digits.length >= 7 && digits.length <= 15) {
      variants.add(`+${digits}`);
    }
  }

  return [...variants].filter(Boolean);
}
