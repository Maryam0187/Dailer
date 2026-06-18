import { formatLandline } from "@/lib/phoneFormat";

/** Lead monitors see only the last seven digits of phone and cell numbers. */
export function shouldRedactLeadPhones(role) {
  return role === "lead_monitor";
}

export function maskPhoneLastFour(value) {
  if (value == null || value === "") return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 0) return "—";
  if (digits.length <= 7) return digits;
  const tail = digits.slice(-7);
  return `***-${tail.slice(0, 3)}-${tail.slice(3)}`;
}

export function formatLeadPhoneDisplay(phone, redacted) {
  if (!phone) return "—";
  if (redacted) return phone;
  return formatLandline(phone) || phone;
}
