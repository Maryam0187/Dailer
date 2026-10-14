/**
 * OneSignal External ID: <username>_<id>
 * Avoids restricted bare values like "1" (admin) by always including username + id.
 * @see https://documentation.onesignal.com/docs/en/users#restricted-ids
 */
export function sanitizeOneSignalUsername(username) {
  const raw = String(username || "")
    .trim()
    .toLowerCase();
  const safe = raw.replace(/[^a-z0-9_-]/g, "").replace(/^-+|-+$/g, "").slice(0, 64);
  return safe || "user";
}

export function toOneSignalExternalId(userId, username) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (username == null || String(username).trim() === "") return null;
  return `${sanitizeOneSignalUsername(username)}_${id}`;
}
