/**
 * POST /api/calls/start-cold — customer-first cold dial.
 */
export async function startColdCall({ toNumber, contactName, city, state, zipCode }) {
  const trimmed = String(toNumber || "").trim();
  const res = await fetch("/api/calls/start-cold", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      toNumber: trimmed,
      contactName: contactName || undefined,
      city: city || undefined,
      state: state || undefined,
      zipCode: zipCode || undefined,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.error || "Cold dial failed" };
  return {
    ok: true,
    call: json.call,
    callMode: json.callMode || "cold",
    dialMode: json.dialMode || "customer_first",
  };
}
