"use client";

/**
 * Pick a night-shift agent for a pending legacy import.
 * Shows who the sale will belong to (createdBy) and their supervisor (assigned).
 */
export default function LegacyImportAssignControls({
  nightUsers = [],
  value = "",
  onChange,
  onAssign,
  busy = false,
  compact = false,
}) {
  const selected = nightUsers.find((u) => String(u.id) === String(value)) || null;
  const belongsTo = selected?.username || null;
  const assignedTo =
    selected?.supervisorUsername ||
    (selected && !selected.supervisorId ? selected.username : null);

  return (
    <div className={compact ? "flex flex-col gap-2" : "space-y-3"}>
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : ""}`}>
        <select
          className="h-11 min-w-[12rem] flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-violet-500/80 focus:ring-2 focus:ring-violet-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          value={value || ""}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={busy}
        >
          <option value="">Night user (sale owner)…</option>
          {nightUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username} (#{u.id}, {u.role})
              {u.supervisorUsername ? ` → ${u.supervisorUsername}` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !value}
          onClick={onAssign}
          className="rounded-xl bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-violet-600"
        >
          {busy ? "…" : "Send to Leads"}
        </button>
      </div>
      {selected ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Sale will belong to <strong className="text-zinc-900 dark:text-zinc-100">{belongsTo}</strong>
          {assignedTo ? (
            <>
              {" "}
              · Assigned to supervisor{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">{assignedTo}</strong>
            </>
          ) : (
            <> · No supervisor — assigned to the same user</>
          )}
          . Then it appears on the main Leads page.
        </p>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Choose who this sale belongs to. After send, it leaves Import and shows in Leads.
        </p>
      )}
    </div>
  );
}
