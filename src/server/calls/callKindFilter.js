import { Op } from "sequelize";

/** Parse call log list/metrics scope: all | lead | conference */
export function parseCallScope(scopeRaw) {
  const scope = String(scopeRaw || "all").trim().toLowerCase();
  if (scope === "lead") return { kind: "lead", conferenceOnly: false };
  if (scope === "conference") return { kind: null, conferenceOnly: true };
  return { kind: null, conferenceOnly: false };
}

export function applyCallKindToWhere(where, callKind) {
  if (!callKind) return where;
  return { ...where, callKind };
}

/**
 * True when `where` is absent or `{}`.
 * Sequelize operators are Symbol keys, so `Object.keys` alone treats `{ [Op.or]: ... }` as empty.
 */
export function isEmptyWhere(where) {
  if (!where || typeof where !== "object") return true;
  return Object.keys(where).length === 0 && Object.getOwnPropertySymbols(where).length === 0;
}

/**
 * Keep Sales Bot calls off the main dialer / user call-log lists.
 * They are listed only on the Sales Bot page.
 */
export function excludeSalesBotFromWhere(where) {
  const exclude = {
    [Op.and]: [
      { [Op.or]: [{ callKind: { [Op.is]: null } }, { callKind: { [Op.ne]: "sales_bot" } }] },
      { [Op.or]: [{ dialMode: { [Op.is]: null } }, { dialMode: { [Op.ne]: "sales_bot" } }] },
    ],
  };
  if (isEmptyWhere(where)) return exclude;
  return { [Op.and]: [where, exclude] };
}

/** `1` / `line1` / `2` / `line2`. Anything else = all lines. */
export function parseDialerIndexFilter(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "1" || v === "line1") return 1;
  if (v === "2" || v === "line2") return 2;
  return null;
}

export function applyDialerIndexToWhere(where, dialerIndex) {
  if (dialerIndex !== 1 && dialerIndex !== 2) return where;
  return { ...where, dialerIndex };
}

/** `zoom` | `twilio`. Anything else (incl. `both` / `all`) = no filter. */
export function parseVoiceProviderFilter(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "zoom") return "zoom";
  if (v === "twilio") return "twilio";
  return null;
}

export function applyVoiceProviderToWhere(where, voiceProvider) {
  if (voiceProvider !== "zoom" && voiceProvider !== "twilio") return where;
  return { ...where, voiceProvider };
}
