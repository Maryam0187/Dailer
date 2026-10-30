/** Infer Zoom vs Twilio for inbound/callback notifications. */
export function resolveVoiceProvider({ callSid, voiceProvider } = {}) {
  const explicit = String(voiceProvider || "")
    .trim()
    .toLowerCase();
  if (explicit === "zoom" || explicit === "twilio") return explicit;
  const sid = String(callSid || "").trim();
  if (sid.startsWith("zoom:")) return "zoom";
  if (sid) return "twilio";
  return null;
}

export function voiceProviderLabel(provider) {
  if (provider === "zoom") return "Zoom";
  // Twilio inbound/callbacks use our dialer softphone — show "Dialer" in the UI.
  if (provider === "twilio") return "Dialer";
  return null;
}

export function voiceProviderBadgeClass(provider) {
  if (provider === "zoom") {
    return "bg-blue-50 text-blue-800 ring-blue-600/20 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-400/30";
  }
  if (provider === "twilio") {
    return "bg-red-50 text-red-800 ring-red-600/20 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-400/30";
  }
  return "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-400/30";
}
