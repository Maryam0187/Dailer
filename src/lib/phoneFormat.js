/** US-style display: XXX-XXX-XXXX (same idea as CRM formatLandline). */
export function formatLandline(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 15);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}${digits.length > 10 ? ` ${digits.slice(10)}` : ""}`;
}

/** CRM call-logs style validation. */
export function validatePhone(v) {
  if (!v?.trim()) return { isValid: false, message: "Phone number is required" };
  const clean = v.replace(/\D/g, "");
  if (clean.length < 10) return { isValid: false, message: "At least 10 digits required" };
  if (clean.length > 15) return { isValid: false, message: "Max 15 digits" };
  return { isValid: true, message: "" };
}

export function digitsOnly(v) {
  return String(v || "").replace(/\D/g, "");
}
