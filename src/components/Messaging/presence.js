export function normalizePresence(value) {
  if (value === "online" || value === "away" || value === "offline") return value;
  return "offline";
}

export function PresenceDot({ status, showLabel = false, className = "" }) {
  const value = normalizePresence(status);
  const styles = {
    online: { dot: "bg-emerald-500", label: "Online" },
    away: { dot: "bg-amber-500", label: "Away" },
    offline: { dot: "bg-zinc-400", label: "Offline" },
  };
  const s = styles[value];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {showLabel ? s.label : null}
    </span>
  );
}

export function formatMessageTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
