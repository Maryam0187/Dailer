function formatDateRange(startDate, endDate) {
  if (startDate === endDate) return startDate;
  return `${startDate} – ${endDate}`;
}

/** Payload for Web3Forms admin alert when a user submits leave. */
export function buildLeaveApplicationAlert({ userId, username, startDate, endDate, reason, applicationId }) {
  if (process.env.LEAVE_APPLICATION_ALERT_ENABLED === "false") return null;

  const displayName = username || `User #${userId}`;
  const when = new Date().toLocaleString();
  const dateRange = formatDateRange(startDate, endDate);
  const trimmedReason = String(reason || "").trim();

  const message = [
    `User "${displayName}" (ID ${userId}) submitted a leave application.`,
    "",
    `Time: ${when}`,
    `Dates: ${dateRange}`,
    `Application ID: ${applicationId}`,
    "",
    trimmedReason ? `Reason:\n${trimmedReason}` : "Reason: (none provided)",
    "",
    "Leave is auto-approved and will block sign-in on those dates.",
  ].join("\n");

  return {
    subject: `Dialer alert: leave application from ${displayName}`,
    message,
    replyTo: process.env.ADMIN_ALERT_EMAIL || null,
  };
}
