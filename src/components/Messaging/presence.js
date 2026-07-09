export function normalizePresence(value) {
  if (value === "online" || value === "away" || value === "offline") return value;
  return "offline";
}

export function PresenceDot({ status, showLabel = false, className = "" }) {
  const value = normalizePresence(status);
  const styles = {
    online: { dot: "bg-emerald-500", label: "Online" },
    away: { dot: "bg-amber-500", label: "Away" },
    offline: { dot: "bg-zinc-400 dark:bg-zinc-500", label: "Offline" },
  };
  const s = styles[value];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
      {showLabel ? s.label : null}
    </span>
  );
}

const AVATAR_TONES = [
  "from-sky-500 to-sky-700",
  "from-emerald-500 to-emerald-700",
  "from-indigo-500 to-indigo-700",
  "from-violet-500 to-violet-700",
  "from-cyan-500 to-cyan-700",
  "from-teal-500 to-teal-700",
];

function avatarTone(seed) {
  const text = String(seed || "?");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash + text.charCodeAt(i) * (i + 1)) % 997;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function initialsFromName(name) {
  const parts = String(name || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export function UserAvatar({ name, presence = null, size = "md", className = "" }) {
  const sizes = {
    sm: "h-8 w-8 text-[10px]",
    md: "h-10 w-10 text-xs",
    lg: "h-11 w-11 text-sm",
  };
  const ring =
    presence === "online"
      ? "ring-2 ring-emerald-400/80"
      : presence === "away"
        ? "ring-2 ring-amber-400/70"
        : "ring-1 ring-black/5 dark:ring-white/10";

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ${sizes[size] || sizes.md} ${ring} ${avatarTone(name)} ${className}`}
      aria-hidden
    >
      {initialsFromName(name)}
      {presence ? (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-zinc-950 ${
            presence === "online"
              ? "bg-emerald-500"
              : presence === "away"
                ? "bg-amber-500"
                : "bg-zinc-400"
          }`}
        />
      ) : null}
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
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return `Yesterday ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function roleLabel(role) {
  if (!role) return "";
  return String(role).replace(/_/g, " ");
}
