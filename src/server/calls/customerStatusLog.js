/** Dev-only logs for Twilio customer status → Socket.IO pipeline. */

export function logCustomerStatus(step, detail) {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.CUSTOMER_STATUS_LOG === "0") return;
  console.log(`[customer-status] ${step}`, detail);
}
