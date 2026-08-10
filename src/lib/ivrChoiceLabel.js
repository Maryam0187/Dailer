/** Service-menu digit → admin-facing label (Studio ask_associate_number). */
export function ivrChoiceLabel(choice, { empty = "Choice: (none)", prefix = true } = {}) {
  const d = String(choice ?? "").trim();
  if (d === "0") return "Recent service charge (pressed 0)";
  if (d === "1") return "Home theater installation (pressed 1)";
  if (d === "2") return "Receiver upgrades (pressed 2)";
  if (d === "3") return "Software services (pressed 3)";
  if (!d) return empty;
  return prefix ? `Choice: ${d}` : d;
}

/**
 * After recent charge (Studio ask_has_associate):
 * 0 = connect with agent, 1 = has associate number, 2 = does not.
 */
export function ivrAssociateLabel(associate, { empty = null } = {}) {
  const d = String(associate ?? "").trim();
  if (d === "0") return "Connect with agent (pressed 0)";
  if (d === "1") return "Calling with associate number (pressed 1)";
  if (d === "2") return "Not calling with associate number (pressed 2)";
  if (!d) return empty;
  return `Associate: ${d}`;
}
