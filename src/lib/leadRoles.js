/** Roles that can list, filter, and open any lead. */
export function hasFullLeadAccess(role) {
  return role === "admin" || role === "manager" || role === "lead_monitor";
}

/** Lead-monitor tooling (recordings on any lead, reassignment). */
export function hasLeadMonitorAccess(role) {
  return role === "admin" || role === "lead_monitor";
}

/** Lead stats tab and metrics API — admin only. */
export function canViewLeadStats(role) {
  return role === "admin";
}

/** Roles that see agent/supervisor filters on the leads page. */
export function canUseLeadFilters(role) {
  return hasFullLeadAccess(role) || role === "supervisor";
}
