/**
 * Parse Studio HTTP Request JSON or form-urlencoded body.
 */
export async function parseIvrBody(req) {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => null);
    return normalize(json && typeof json === "object" ? json : {});
  }

  try {
    const form = await req.formData();
    const obj = {};
    for (const [key, value] of form.entries()) {
      obj[key] = typeof value === "string" ? value : String(value);
    }
    return normalize(obj);
  } catch {
    return normalize({});
  }
}

function normalize(raw) {
  return {
    type: raw.type != null ? String(raw.type) : null,
    step: raw.step != null ? String(raw.step).trim() || null : null,
    from: raw.from != null ? String(raw.from).trim() : raw.From != null ? String(raw.From).trim() : null,
    to: raw.to != null ? String(raw.to).trim() : raw.To != null ? String(raw.To).trim() : null,
    callSid:
      raw.callSid != null
        ? String(raw.callSid).trim()
        : raw.CallSid != null
          ? String(raw.CallSid).trim()
          : null,
    choice: raw.choice != null ? String(raw.choice).trim() : null,
    number: raw.number != null ? String(raw.number).trim() : null,
  };
}

export function assertIvrSecret(req) {
  const expected = process.env.IVR_WEBHOOK_SECRET?.trim();
  if (!expected) return true;
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ||
    req.headers.get("x-ivr-secret") ||
    "";
  return String(provided) === expected;
}
