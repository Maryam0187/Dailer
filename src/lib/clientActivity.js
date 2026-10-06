const FLUSH_MS = 1500;
const MAX_QUEUE = 40;

const queue = [];
let flushTimer = null;

function scheduleFlush() {
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushClientActivity(false);
  }, FLUSH_MS);
}

function postEvents(events, useBeacon) {
  const body = JSON.stringify({ events });
  if (useBeacon && typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon(
      "/api/activity",
      new Blob([body], { type: "application/json" }),
    );
    return;
  }

  void fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function trackClientActivity(action, metadata = {}, entityType = null, entityId = null) {
  if (!action) return;
  queue.push({
    action,
    metadata,
    entityType,
    entityId,
  });
  if (queue.length >= MAX_QUEUE) {
    flushClientActivity(false);
    return;
  }
  scheduleFlush();
}

export function trackCopyActivity({
  source = "unknown",
  path = null,
  selectionLength = null,
  entityType = null,
  entityId = null,
  field = null,
} = {}) {
  trackClientActivity(
    "text_copy",
    {
      source,
      path: path || currentPath(),
      selectionLength,
      field,
    },
    entityType,
    entityId,
  );
}

export function trackCopyBlocked({
  source = "unknown",
  path = null,
  entityType = null,
  entityId = null,
} = {}) {
  trackClientActivity(
    "copy_blocked",
    {
      source,
      path: path || currentPath(),
    },
    entityType,
    entityId,
  );
}

export function currentPath() {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search || ""}`;
}

export function flushClientActivity(useBeacon = false) {
  if (flushTimer != null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  const events = queue.splice(0, MAX_QUEUE);
  postEvents(events, useBeacon);
}
