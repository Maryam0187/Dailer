"use client";

/**
 * Display name (large) + @username (small, light). Falls back to username only.
 */
export default function UserNameLabel({
  displayName = null,
  username = null,
  name = null,
  className = "",
  displayClassName = "text-base font-semibold leading-tight text-zinc-900 dark:text-zinc-50",
  usernameClassName = "text-xs font-normal text-zinc-400 dark:text-zinc-500",
  truncate = true,
}) {
  const display = displayName != null ? String(displayName).trim() : "";
  const user = username != null ? String(username).trim() : "";

  // Combined API label "Display @user" when separate fields are missing
  if (!display && !user && name) {
    const combined = String(name).trim();
    const at = combined.lastIndexOf(" @");
    if (at > 0) {
      const d = combined.slice(0, at).trim();
      const u = combined.slice(at + 2).trim();
      if (d && u) {
        return (
          <span
            className={`inline-flex min-w-0 max-w-full items-baseline gap-1.5 ${
              truncate ? "truncate" : ""
            } ${className}`}
          >
            <span className={`${displayClassName} ${truncate ? "truncate" : ""}`}>{d}</span>
            <span className={`shrink-0 ${usernameClassName}`}>@{u}</span>
          </span>
        );
      }
    }
    return (
      <span className={`${displayClassName} ${truncate ? "truncate" : ""} ${className}`}>
        {combined || "Unknown"}
      </span>
    );
  }

  if (display && user) {
    return (
      <span
        className={`inline-flex min-w-0 max-w-full items-baseline gap-1.5 ${
          truncate ? "truncate" : ""
        } ${className}`}
      >
        <span className={`${displayClassName} ${truncate ? "truncate" : ""}`}>{display}</span>
        <span className={`shrink-0 ${usernameClassName}`}>@{user}</span>
      </span>
    );
  }

  const fallback = display || user || name || "Unknown";
  return (
    <span className={`${displayClassName} ${truncate ? "truncate" : ""} ${className}`}>
      {fallback}
    </span>
  );
}

export function avatarNameFromUser(user) {
  if (!user) return "Unknown";
  const display = user.displayName != null ? String(user.displayName).trim() : "";
  if (display) return display;
  const username = user.username != null ? String(user.username).trim() : "";
  if (username) return username;
  if (user.name) {
    const combined = String(user.name).trim();
    const at = combined.lastIndexOf(" @");
    if (at > 0) return combined.slice(0, at).trim() || combined;
    return combined;
  }
  return "Unknown";
}
