/** Invoice label for a manager, e.g. "Team Haris (Manager)". */
export function teamManagerLabel(userOrName) {
  const name =
    typeof userOrName === "string"
      ? userOrName.trim()
      : String(userOrName?.displayName || "").trim() || String(userOrName?.username || "").trim();
  if (!name) return null;
  return `Team ${name} (Manager)`;
}
