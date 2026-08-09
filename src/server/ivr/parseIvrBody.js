/**
 * Parse Studio HTTP Request JSON, form body, or query string.
 * Studio often sends application/json; also support key/value HTTP parameters.
 */
export async function parseIvrBody(req) {
  const url = new URL(req.url);
  const fromQuery = pickParams(Object.fromEntries(url.searchParams.entries()));

  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  let fromBody = {};

  try {
    if (contentType.includes("application/json")) {
      const text = await req.text();
      if (text && text.trim()) {
        try {
          const json = JSON.parse(text);
          if (json && typeof json === "object") fromBody = pickParams(json);
        } catch {
          // Studio occasionally posts raw key=value in a JSON content-type
          fromBody = pickParams(Object.fromEntries(new URLSearchParams(text)));
        }
      }
    } else {
      const form = await req.formData();
      const obj = {};
      for (const [key, value] of form.entries()) {
        obj[key] = typeof value === "string" ? value : String(value);
      }
      fromBody = pickParams(obj);
    }
  } catch {
    fromBody = {};
  }

  return normalize({ ...fromQuery, ...compact(fromBody) });
}

function pickParams(raw) {
  if (!raw || typeof raw !== "object") return {};
  return {
    type: raw.type,
    step: raw.step,
    from: raw.from ?? raw.From,
    to: raw.to ?? raw.To,
    callSid: raw.callSid ?? raw.CallSid,
    choice: raw.choice ?? raw.Digits,
    number: raw.number,
  };
}

function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s || s.startsWith("{{")) continue; // unresolved liquid
    out[k] = s;
  }
  return out;
}

function normalize(raw) {
  const from = raw.from != null ? String(raw.from).trim() : null;
  const to = raw.to != null ? String(raw.to).trim() : null;
  const callSid = raw.callSid != null ? String(raw.callSid).trim() : null;
  const choice = raw.choice != null ? String(raw.choice).trim() : null;
  const number = raw.number != null ? String(raw.number).trim() : null;
  const step = raw.step != null ? String(raw.step).trim() : null;
  const type = raw.type != null ? String(raw.type).trim() : null;
  return {
    type: type || null,
    step: step || null,
    from: from || null,
    to: to || null,
    callSid: callSid || null,
    choice: choice || null,
    number: number || null,
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
