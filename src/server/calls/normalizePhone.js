/**
 * Normalize a phone number to E.164 when possible (US 10/11 digit supported).
 * @param {string} rawNumber
 * @returns {string | null}
 */
export function normalizeToE164(rawNumber) {
  const input = String(rawNumber || "").trim();
  if (!input) return null;

  if (input.startsWith("+")) {
    const normalized = `+${input.slice(1).replace(/\D/g, "")}`;
    return normalized.length >= 8 ? normalized : null;
  }

  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
