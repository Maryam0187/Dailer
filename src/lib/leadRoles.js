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

/** Processors must not see agent lead notes on leads assigned for processing. */
export function shouldHideLeadNotes(viewerRole, lead) {
  if (viewerRole !== "processor") return false;
  return lead?.processorUserId != null || Boolean(lead?.leadProcessedRequired);
}

/** Processors only see their own lead activity on processing leads. */
export function shouldRestrictProcessorLeadActivity(viewerRole, lead) {
  return shouldHideLeadNotes(viewerRole, lead);
}

/** @deprecated Use shouldRestrictProcessorLeadActivity */
export const shouldHideAgentLeadActivity = shouldRestrictProcessorLeadActivity;
