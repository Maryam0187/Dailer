/**
 * Submit alert email from the browser via Web3Forms (client-side API).
 * Access key is public — set NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY in env.
 */
export async function sendWeb3FormsClient({ subject, message, replyTo }) {
  const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY?.trim();
  if (!accessKey) {
    console.warn("[sendWeb3FormsClient] NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY not configured");
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        access_key: accessKey,
        subject,
        from_name: "Dialer",
        email: replyTo || "noreply@localhost",
        message,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success !== true) {
      console.warn("[sendWeb3FormsClient]", json?.message || res.status);
      return { ok: false, error: json?.message || "Web3Forms request failed" };
    }

    return { ok: true };
  } catch (err) {
    console.warn("[sendWeb3FormsClient]", err?.message || err);
    return { ok: false, error: err?.message || "Web3Forms request failed" };
  }
}
