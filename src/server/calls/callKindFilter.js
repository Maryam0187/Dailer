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
