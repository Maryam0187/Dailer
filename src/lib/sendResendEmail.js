/**
 * Send transactional email via Resend (server-only).
 * Requires RESEND_API_KEY and RESEND_FROM_EMAIL.
 * `to` may be a string, comma/semicolon-separated list, or string[].
 */

export function normalizeEmailList(to) {
  const parts = Array.isArray(to) ? to : String(to || "").split(/[,;\s]+/);
  const emails = [];
  const seen = new Set();
  for (const part of parts) {
    const email = String(part || "")
      .trim()
      .toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

export async function sendResendEmail({ to, subject, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const recipients = normalizeEmailList(to);

  if (!apiKey) {
    console.warn("[sendResendEmail] RESEND_API_KEY not configured");
    return { ok: false, skipped: true };
  }
  if (!from) {
    console.warn("[sendResendEmail] RESEND_FROM_EMAIL not configured");
    return { ok: false, skipped: true };
  }
  if (!recipients.length) {
    console.warn("[sendResendEmail] missing recipient");
    return { ok: false, skipped: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const payload = {
      from,
      to: recipients,
      subject: String(subject || "Dialer alert"),
      text: String(text || ""),
    };
    const replyList = normalizeEmailList(replyTo);
    if (replyList.length) payload.replyTo = replyList[0];

    const { data, error } = await resend.emails.send(payload);
    if (error) {
      console.warn("[sendResendEmail]", error.message || error);
      return { ok: false, error: error.message || "Resend request failed" };
    }
    return { ok: true, id: data?.id || null, to: recipients };
  } catch (err) {
    console.warn("[sendResendEmail]", err?.message || err);
    return { ok: false, error: err?.message || "Resend request failed" };
  }
}
