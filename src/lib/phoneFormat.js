/** Strip to up to 10 US national digits (handles +1 / leading 1). */
export function nationalUsDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.slice(0, 10);
}

/** US-style display: XXX-XXX-XXXX (same idea as CRM formatLandline). */
export function formatLandline(value) {
  const digits = nationalUsDigits(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** CRM call-logs style validation. */
export function validatePhone(v) {
  if (!v?.trim()) return { isValid: false, message: "Phone number is required" };
  const clean = v.replace(/\D/g, "");
  if (clean.length !== 10) return { isValid: false, message: "Enter a valid 10-digit number" };
  return { isValid: true, message: "" };
}

export function digitsOnly(v) {
  return String(v || "").replace(/\D/g, "");
}
