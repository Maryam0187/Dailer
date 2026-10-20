"use client";

/**
 * Shared attendance status colors for admin, manager, and agent views.
 * Present = green, Half leave = orange, Leave = yellow, Absent = red.
 */
export default function AttendanceStatusBadge({ day }) {
  if (day?.isCompanyLeave || day?.companyLeaveLabel) {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
        {day.companyLeaveLabel || "Company leave"}
      </span>
    );
  }
  if (day?.status === "on_leave") {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
        On leave
      </span>
    );
  }
  if (day?.status === "absent") {
    return (
      <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
        Absent
      </span>
    );
  }
  if (day?.status === "exempt") {
    return (
      <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        Exempt
      </span>
    );
  }
  if (day?.status === "half_leave") {
    return (
      <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900 dark:bg-orange-950/50 dark:text-orange-200">
        Half leave
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
      Present
    </span>
  );
}
