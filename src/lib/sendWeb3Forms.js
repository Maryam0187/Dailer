/**
 * Submit alert email via Web3Forms.
 * Access key is public — set NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY in env.
 * Admin inbox is configured when creating the key at https://web3forms.com/
 */
export async function sendWeb3Forms({ subject, message, replyTo }) {
  const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY?.trim();
  if (!accessKey) {
    console.warn("[sendWeb3Forms] NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY not configured");
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
      console.warn("[sendWeb3Forms]", json?.message || res.status);
      return { ok: false, error: json?.message || "Web3Forms request failed" };
    }

    return { ok: true };
  } catch (err) {
    console.warn("[sendWeb3Forms]", err?.message || err);
    return { ok: false, error: err?.message || "Web3Forms request failed" };
  }
}
