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

/** Charged / declined / chargeback / processor — admin only. */
export function canViewLeadPaymentChargeInfo(role) {
  return role === "admin";
}

/**
 * Reserved for cases where a payment method should be omitted entirely.
 * Admins always see every method.
 */
export function shouldHideLeadPaymentMethodFromViewer(viewerRole, _creatorRole) {
  if (viewerRole === "admin") return false;
  return false;
}

/**
 * Non-admins always see last-4 / masked payment digits (even for methods they added).
 * Admins always see full payment method details.
 */
export function shouldLockLeadPaymentSensitiveFields(viewerRole, _leadPhase, _creatorRole = null) {
  return viewerRole !== "admin";
}

/**
 * Lead timeline bodies that non-admins must not see:
 * charged / declined / chargeback / processor / payment-link audit lines.
 */
export function isAdminOnlyPaymentChargeActivityBody(body) {
  const text = String(body || "").trim();
  if (!text) return false;
  return (
    /^Payment charged\b/i.test(text) ||
    /^Payment declined\b/i.test(text) ||
    /^Payment chargeback\b/i.test(text) ||
    /^Payment charge status cleared\b/i.test(text) ||
    /^Payment method linked\b/i.test(text) ||
    /^Payment method unlinked\b/i.test(text) ||
    /^Linked payment method\b/i.test(text) ||
    /^Charged with\b/i.test(text) ||
    /^Charged payment method cleared\b/i.test(text) ||
    /^Charge amount\b/i.test(text)
  );
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

/** Same rule as notes: hide payment methods from processors on processing leads. */
export function shouldHideLeadPaymentSection(viewerRole, lead) {
  return shouldHideLeadNotes(viewerRole, lead);
}

/** Processors only see their own lead activity on processing leads. */
export function shouldRestrictProcessorLeadActivity(viewerRole, lead) {
  return shouldHideLeadNotes(viewerRole, lead);
}

/** @deprecated Use shouldRestrictProcessorLeadActivity */
export const shouldHideAgentLeadActivity = shouldRestrictProcessorLeadActivity;
