/**
 * Parse Studio HTTP Request: query string, form fields (HTTP Parameters), or JSON.
 */

export async function parseIvrBody(req) {
  const url = new URL(req.url);
  const fromQuery = Object.fromEntries(url.searchParams.entries());

  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  let fromBody = {};

  try {
    if (contentType.includes("application/json")) {
      const text = await req.text();
      if (text && text.trim()) {
        try {
          const json = JSON.parse(text);
          if (json && typeof json === "object" && !Array.isArray(json)) fromBody = json;
        } catch {
          fromBody = Object.fromEntries(new URLSearchParams(text));
        }
      }
    } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data") || !contentType) {
      try {
        const form = await req.formData();
        for (const [key, value] of form.entries()) {
          fromBody[key] = typeof value === "string" ? value : String(value);
        }
      } catch {
        /* empty body */
      }
    } else {
      const text = await req.text().catch(() => "");
      if (text) {
        try {
          fromBody = Object.fromEntries(new URLSearchParams(text));
        } catch {
          fromBody = {};
        }
      }
    }
  } catch {
    fromBody = {};
  }

  // Body wins over query when both set; compact drops empty / unresolved liquid.
  return normalize(compact({ ...fromQuery, ...fromBody }));
}

function firstDefined(raw, keys) {
  for (const key of keys) {
    if (raw[key] != null && String(raw[key]).trim() !== "") return raw[key];
  }
  return null;
}

function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    // Unresolved Studio liquid
    if (s.includes("{{") && s.includes("}}")) continue;
    out[k] = s;
  }
  return out;
}

function normalize(raw) {
  const from = firstDefined(raw, ["from", "From"]);
  const to = firstDefined(raw, ["to", "To"]);
  const callSid = firstDefined(raw, ["callSid", "CallSid", "call_sid"]);
  // Studio Gather often exposes Digits; our widgets send choice / associate / number.
  const choice = firstDefined(raw, ["choice", "Choice", "ask_choice"]);
  const associate = firstDefined(raw, ["associate", "Associate", "hasAssociate"]);
  const number = firstDefined(raw, ["number", "Number", "numberEntered", "ask_number"]);
  const step = firstDefined(raw, ["step", "Step"]);
  const type = firstDefined(raw, ["type", "Type"]);

  // If only Digits arrived, map by step (do not let associate digits overwrite service choice).
  let resolvedChoice = choice;
  let resolvedAssociate = associate;
  let resolvedNumber = number;
  const digitsOnly = firstDefined(raw, ["Digits", "digits"]);
  if (step === "number" && !resolvedNumber && digitsOnly) resolvedNumber = digitsOnly;
  else if (step === "associate" && !resolvedAssociate && digitsOnly) resolvedAssociate = digitsOnly;
  else if ((step === "choice" || !step) && !resolvedChoice && digitsOnly) resolvedChoice = digitsOnly;

  return {
    type: type || null,
    step: step || null,
    from: from || null,
    to: to || null,
    callSid: callSid || null,
    choice: resolvedChoice || null,
    associate: resolvedAssociate || null,
    number: resolvedNumber || null,
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
