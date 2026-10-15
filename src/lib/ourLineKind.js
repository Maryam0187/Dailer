/**
 * Classify a company line (Twilio To) as toll-free vs local for admin UI.
 * US/Canada toll-free NPAs: 800, 888, 877, 866, 855, 844, 833, 822.
 */

const TOLL_FREE_NPAS = new Set([
  "800",
  "888",
  "877",
  "866",
  "855",
  "844",
  "833",
  "822",
]);

export function ourLineKind(rawTo) {
  const digits = String(rawTo || "").replace(/\D/g, "");
  if (!digits) return "unknown";
  let npa = "";
  if (digits.length === 11 && digits.startsWith("1")) npa = digits.slice(1, 4);
  else if (digits.length === 10) npa = digits.slice(0, 3);
  else if (digits.length > 11 && digits.startsWith("1")) npa = digits.slice(1, 4);
  if (npa && TOLL_FREE_NPAS.has(npa)) return "toll_free";
  if (digits.length >= 10) return "local";
  return "unknown";
}

export function ourLineKindLabel(rawTo) {
  const kind = ourLineKind(rawTo);
  if (kind === "toll_free") return "Toll-free";
  if (kind === "local") return "Local";
  return "Line";
}

/** e.g. "Called us at +1… · Local" */
export function calledUsAtLabel(rawTo) {
  const to = String(rawTo || "").trim();
  if (!to) return "Called us at —";
  return `Called us at ${to} · ${ourLineKindLabel(to)}`;
}
