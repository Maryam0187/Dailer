/**
 * POST /api/calls/start — shared by the dialing panel.
 * @param {string} toNumber E.164 or digits; stored as provided after trim.
 * @returns {Promise<{ ok: true, call: object } | { ok: false, error: string }>}
 */
export async function startOutgoingCall(toNumber) {
  const trimmed = String(toNumber || "").trim();
  const res = await fetch("/api/calls/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ toNumber: trimmed }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.error || "Dial failed" };
  return { ok: true, call: json.call };
}
