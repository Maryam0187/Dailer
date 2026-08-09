function choiceLabel(choice) {
  const d = String(choice || "").trim();
  if (d === "1") return "Calling with associate number (pressed 1)";
  if (d === "2") return "Not associate — entered / will enter number (pressed 2)";
  return d ? `Choice: ${d}` : "Choice: (none)";
}

function alertToAddress() {
  return (
    process.env.IVR_ALERT_EMAIL?.trim() ||
    process.env.ADMIN_ALERT_EMAIL?.trim() ||
    null
  );
}

export function isIvrAlertEnabled() {
  return process.env.IVR_ALERT_ENABLED !== "false";
}

/** Resend payload for IVR events, or null if disabled / missing To. */
export function buildIvrAlert(payload) {
  if (!isIvrAlertEnabled()) return null;
  const to = alertToAddress();
  if (!to) return null;

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
    lines.push("", choiceLabel(choice));
    if (number) lines.push(`Entered number: ${number}`);
  }

  if (type === "incoming") {
    lines.push("", "Open the dialer if you can take the call after IVR.");
  }

  return {
    to,
    subject,
    text: lines.join("\n"),
    replyTo: process.env.ADMIN_ALERT_EMAIL?.trim() || undefined,
  };
}
