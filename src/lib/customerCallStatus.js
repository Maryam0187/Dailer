const LIVE_STATUSES = new Set(["in-progress", "answered"]);
const TERMINAL_STATUSES = new Set([
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled",
  "cancelled",
]);

export function isCustomerCallLive(status) {
  return LIVE_STATUSES.has(String(status || "").trim().toLowerCase());
}

export function isCustomerCallTerminal(status) {
  return TERMINAL_STATUSES.has(String(status || "").trim().toLowerCase());
}

export function customerStatusLabel(status) {
  const s = String(status || "").trim().toLowerCase();
  switch (s) {
    case "ringing":
      return "Ringing";
    case "in-progress":
    case "answered":
      return "In progress";
    case "initiated":
    case "queued":
      return "Queued";
    case "completed":
      return "Completed";
    case "busy":
      return "Busy";
    case "failed":
      return "Failed";
    case "no-answer":
      return "No answer";
    case "canceled":
    case "cancelled":
      return "Canceled";
    default:
      return s ? s.replace(/-/g, " ") : "Connecting";
  }
}

/** Session fields to merge when a customer-status socket event arrives. */
export function buildCustomerSessionPatch(status, current) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return null;

  const patch = { customerStatus: normalized };
  if (isCustomerCallLive(normalized)) {
    patch.phase = "in_progress";
    if (!current?.customerConnectedAt) {
      patch.customerConnectedAt = Date.now();
    }
  }
  return patch;
}

export function customerStatusBadgeClass(status) {
  const s = String(status || "").trim().toLowerCase();
  if (isCustomerCallLive(s)) {
    return "bg-green-500/30 text-green-100";
  }
  if (s === "ringing") {
    return "bg-amber-500/30 text-amber-100";
  }
  if (isCustomerCallTerminal(s)) {
    return "bg-zinc-500/30 text-zinc-100";
  }
  return "bg-gray-500/30 text-gray-100";
}
