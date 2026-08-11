/** Service-menu digit → admin-facing label (Studio service gather). */
export function ivrChoiceLabel(choice, { empty = "Choice: (none)", prefix = true } = {}) {
  const d = String(choice ?? "").trim();
  if (d === "0") return "Recent service charge (pressed 0)";
  if (d === "1") return "Home theater installation (pressed 1)";
  if (d === "2") return "Receiver upgrades (pressed 2)";
  if (d === "3") return "Software services (pressed 3)";
  if (!d) return empty;
  return prefix ? `Choice: ${d}` : d;
}
