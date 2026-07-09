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
  "from-rose-500 to-rose-700",
  "from-orange-500 to-orange-700",
];

/** High-contrast palette for oversight — avoid near neighbors (sky/cyan, etc.). */
const NAME_COLORS = [
  "text-emerald-600 dark:text-emerald-400",
  "text-rose-600 dark:text-rose-400",
  "text-violet-600 dark:text-violet-400",
  "text-amber-600 dark:text-amber-400",
  "text-sky-600 dark:text-sky-400",
  "text-orange-600 dark:text-orange-400",
  "text-fuchsia-600 dark:text-fuchsia-400",
  "text-lime-700 dark:text-lime-400",
];

function hashSeed(seed) {
  const text = String(seed || "?");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash + text.charCodeAt(i) * (i + 1)) % 997;
  }
  return hash;
}

function avatarTone(seed) {
  return AVATAR_TONES[hashSeed(seed) % AVATAR_TONES.length];
}

/**
 * Map participants in a conversation to clearly different colors.
 * Index 0 vs 1 are always high-contrast (emerald vs rose), not similar blues.
 */
export function buildParticipantNameColors(participantsOrNames) {
  const names = [];
  for (const item of participantsOrNames || []) {
    const name =
      typeof item === "string"
        ? item
        : item?.username || item?.author?.username || null;
    if (!name) continue;
    if (!names.includes(name)) names.push(name);
  }

  const map = {};
  names.forEach((name, index) => {
    map[name] = NAME_COLORS[index % NAME_COLORS.length];
  });
  return map;
}

export function ColoredName({ name, colorClass = null, className = "" }) {
  const label = name || "Unknown";
  const color = colorClass || NAME_COLORS[hashSeed(label) % NAME_COLORS.length];
  return <span className={`font-bold ${color} ${className}`}>{label}</span>;
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
