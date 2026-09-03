/**
 * POST /api/calls/start-line2 — outbound Line 2 (sidecar). Does not use /api/calls/start.
 * @param {{ leadId?: number, toNumber?: string }} params
 */
export async function startOutgoingCallLine2(params) {
  const leadId = typeof params === "object" && params != null ? params.leadId : undefined;
  const toNumber =
    typeof params === "object" && params != null
      ? params.toNumber
      : typeof params === "string"
        ? params
        : "";
  const trimmed = String(toNumber || "").trim();
  const body = {};
  if (Number.isInteger(leadId) && leadId > 0) body.leadId = leadId;
  else if (trimmed) body.toNumber = trimmed;
  else return { ok: false, error: "leadId or toNumber is required" };

  const res = await fetch("/api/calls/start-line2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.error || "Line 2 dial failed" };
  return {
    ok: true,
    call: json.call,
    callMode: json.callMode || "direct",
    dialMode: json.dialMode || "agent_first",
    dialerIndex: 2,
    lead: json.lead || null,
    conferenceName: json.conferenceName,
  };
}
