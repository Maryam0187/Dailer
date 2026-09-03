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
