const ALLOWED_ACTIONS = new Set([
  "text_copy",
  "copy_blocked",
]);

const MAX_EVENTS_PER_REQUEST = 30;
const MAX_METADATA_JSON_LENGTH = 4096;

function sanitizeString(value, maxLength) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > maxLength ? s.slice(0, maxLength) : s;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const out = {};
  for (const [key, raw] of Object.entries(metadata)) {
    if (typeof key !== "string" || key.length > 64) continue;
    if (raw == null) continue;
    if (typeof raw === "string") {
      out[key] = sanitizeString(raw, 512);
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      out[key] = raw;
    } else if (typeof raw === "boolean") {
      out[key] = raw;
    }
  }

  if (Object.keys(out).length === 0) return null;
  if (JSON.stringify(out).length > MAX_METADATA_JSON_LENGTH) return null;
  return out;
}

export function parseClientActivityEvents(body) {
  const rawEvents = Array.isArray(body?.events) ? body.events : body?.action ? [body] : [];
  if (rawEvents.length === 0) {
    return { error: "No events provided", events: [] };
  }
  if (rawEvents.length > MAX_EVENTS_PER_REQUEST) {
    return { error: `At most ${MAX_EVENTS_PER_REQUEST} events per request`, events: [] };
  }

  const events = [];
  for (const raw of rawEvents) {
    const action = sanitizeString(raw?.action, 64);
    if (!action || !ALLOWED_ACTIONS.has(action)) continue;

    const metadata = sanitizeMetadata(raw?.metadata);
    const entityType = sanitizeString(raw?.entityType, 32);
    const entityIdRaw = raw?.entityId;
    const entityId =
      entityIdRaw == null || entityIdRaw === ""
        ? null
        : Number.isInteger(Number(entityIdRaw)) && Number(entityIdRaw) > 0
          ? Number(entityIdRaw)
          : null;

    events.push({ action, metadata, entityType, entityId });
  }

  if (events.length === 0) {
    return { error: "No valid events", events: [] };
  }

  return { error: null, events };
}

export { ALLOWED_ACTIONS };
