/**
 * Send transactional email via Resend (server-only).
 * Requires RESEND_API_KEY and RESEND_FROM_EMAIL.
 */

export async function sendResendEmail({ to, subject, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const recipient = String(to || "").trim();

  if (!apiKey) {
    console.warn("[sendResendEmail] RESEND_API_KEY not configured");
    return { ok: false, skipped: true };
  }
  if (!from) {
    console.warn("[sendResendEmail] RESEND_FROM_EMAIL not configured");
    return { ok: false, skipped: true };
  }
  if (!recipient) {
    console.warn("[sendResendEmail] missing recipient");
    return { ok: false, skipped: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const payload = {
      from,
      to: [recipient],
      subject: String(subject || "Dialer alert"),
      text: String(text || ""),
    };
    const reply = String(replyTo || "").trim();
    if (reply) payload.replyTo = reply;

    const { data, error } = await resend.emails.send(payload);
    if (error) {
      console.warn("[sendResendEmail]", error.message || error);
      return { ok: false, error: error.message || "Resend request failed" };
    }
    return { ok: true, id: data?.id || null };
  } catch (err) {
    console.warn("[sendResendEmail]", err?.message || err);
    return { ok: false, error: err?.message || "Resend request failed" };
  }
}
