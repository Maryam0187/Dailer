"use client";

export function presentAbsentFromSummary(summary) {
  return {
    present: Number(summary?.daysPresent) || 0,
    absent: Number(summary?.daysAbsent) || 0,
  };
}

export function presentAbsentFromDays(days = []) {
  let present = 0;
  let absent = 0;
  for (const day of days) {
    if (day.status === "absent") absent += 1;
    else if (day.status !== "on_leave" && day.status !== "exempt") present += 1;
  }
  return { present, absent };
}

function StatCard({ label, present, absent }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Present</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
            {present}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-rose-700 dark:text-rose-300">Absent</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-rose-900 dark:text-rose-100">
            {absent}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Week + month present/absent summary cards.
 * Expects { present, absent } for each period.
 */
export default function AttendancePeriodStats({ week, month, loading = false }) {
  if (loading) {
    return <p className="text-sm text-zinc-500">Loading present / absent…</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <StatCard
        label="This week"
        present={week?.present ?? 0}
        absent={week?.absent ?? 0}
      />
      <StatCard
        label="This month"
        present={month?.present ?? 0}
        absent={month?.absent ?? 0}
      />
    </div>
  );
}
