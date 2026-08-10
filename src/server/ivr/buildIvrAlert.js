import { ivrChoiceLabel } from "@/lib/ivrChoiceLabel";
import { normalizeEmailList } from "@/lib/sendResendEmail";

/** Prefer IVR_ALERT_EMAIL; supports comma/semicolon-separated lists. */
function alertToAddresses() {
  const raw = process.env.IVR_ALERT_EMAIL?.trim() || process.env.ADMIN_ALERT_EMAIL?.trim() || "";
  return normalizeEmailList(raw);
}

export function isIvrAlertEnabled() {
  return process.env.IVR_ALERT_ENABLED !== "false";
}

/** Resend payload for IVR events, or null if disabled / missing To. */
export function buildIvrAlert(payload) {
  if (!isIvrAlertEnabled()) return null;
  const to = alertToAddresses();
  if (!to.length) return null;

  const type = String(payload?.type || "incoming");
  const step = payload?.step ? String(payload.step) : null;
  const from = String(payload?.from || "").trim() || "(unknown)";
  const callTo = String(payload?.to || "").trim() || "(unknown)";
  const callSid = String(payload?.callSid || "").trim() || "(none)";
  const choice = payload?.choice != null ? String(payload.choice) : "";
  const number = payload?.number != null ? String(payload.number) : "";
  const when = payload?.at || new Date().toLocaleString();

  let subject = "Dialer IVR: incoming call";
  if (type === "gather" && step === "choice") subject = "Dialer IVR: caller choice";
  else if (type === "gather" && step === "number") subject = "Dialer IVR: caller number";
  else if (type === "gather") subject = "Dialer IVR: gather update";
  else if (type === "ringing") subject = "Dialer IVR: ringing admin";

  const lines = [
    type === "incoming" ? "An inbound IVR call started." : "IVR gather / status update.",
    "",
    `Time: ${when}`,
    `From: ${from}`,
    `To: ${callTo}`,
    `CallSid: ${callSid}`,
  ];

  if (type === "gather" || choice || number) {
    lines.push("", ivrChoiceLabel(choice));
    if (number) lines.push(`Entered number: ${number}`);
  }

  if (type === "incoming") {
    lines.push("", "Open the dialer if you can take the call after IVR.");
  }

  const replyTo = normalizeEmailList(process.env.ADMIN_ALERT_EMAIL)[0] || to[0];

  return {
    to,
    subject,
    text: lines.join("\n"),
    replyTo,
  };
}
