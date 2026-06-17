export const LEAD_STATUSES = [
  { value: "new", label: "New", tone: "sky" },
  { value: "contacted", label: "Contacted", tone: "blue" },
  { value: "callback", label: "Callback", tone: "amber" },
  { value: "qualified", label: "Qualified", tone: "emerald" },
  { value: "closed", label: "Closed", tone: "zinc" },
  { value: "dnc", label: "Do not call", tone: "red" },
];

const STATUS_MAP = Object.fromEntries(LEAD_STATUSES.map((s) => [s.value, s]));

export function getLeadStatusMeta(status) {
  return STATUS_MAP[String(status || "").toLowerCase()] || { value: status, label: status || "—", tone: "zinc" };
}

export const STATUS_BADGE_CLASS = {
  sky: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100",
  blue: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100",
  amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100",
  emerald:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100",
  zinc: "border-zinc-200 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100",
  red: "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100",
};
