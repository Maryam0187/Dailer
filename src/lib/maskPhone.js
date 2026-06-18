import { digitsOnly, formatLandline } from "@/lib/phoneFormat";

/** Lead monitors see only the last four digits of phone and cell numbers. */
export function shouldRedactLeadPhones(role) {
  return role === "lead_monitor";
}

export function maskPhoneLastFour(value) {
  if (value == null || value === "") return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 0) return "—";
  if (digits.length <= 4) return digits;
  return `***-***-${digits.slice(-4)}`;
}

export function formatLeadPhoneDisplay(phone, redacted) {
  if (!phone) return "—";
  if (redacted) return phone;
  return formatLandline(digitsOnly(phone)) || phone;
}
