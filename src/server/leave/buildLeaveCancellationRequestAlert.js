function formatDateRange(startDate, endDate) {
  if (startDate === endDate) return startDate;
  return `${startDate} – ${endDate}`;
}

/** Payload for Web3Forms admin alert when a user requests leave cancellation. */
export function buildLeaveCancellationRequestAlert({
  userId,
  username,
  startDate,
  endDate,
  reason,
  applicationId,
}) {
  if (process.env.LEAVE_APPLICATION_ALERT_ENABLED === "false") return null;

  const displayName = username || `User #${userId}`;
  const when = new Date().toLocaleString();
  const dateRange = formatDateRange(startDate, endDate);
  const trimmedReason = String(reason || "").trim();

  const message = [
    `User "${displayName}" (ID ${userId}) requested cancellation of their leave application.`,
    "",
    `Time: ${when}`,
    `Dates: ${dateRange}`,
    `Application ID: ${applicationId}`,
    "",
    trimmedReason ? `Original reason:\n${trimmedReason}` : "Original reason: (none provided)",
    "",
    "Review and cancel the application from the Shift page in the admin portal if approved.",
  ].join("\n");

  return {
    subject: `Dialer alert: leave cancellation request from ${displayName}`,
    message,
    replyTo: process.env.ADMIN_ALERT_EMAIL || null,
  };
}
