"use client";

function dayHasLogin(day) {
  return (Number(day?.loginCount) || 0) > 0 || Boolean(day?.firstLoginAt);
}

function isLeaveDayRow(day) {
  return (
    Boolean(day?.isCompanyLeave) ||
    Boolean(day?.companyLeaveLabel) ||
    day?.status === "on_leave" ||
    day?.status === "exempt"
  );
}

/**
 * Present = login on a normal working day (not leave / holiday / exempt).
 * Absent = working day with no login.
 * Leave = leave / holiday / exempt days (with or without login).
 * Login on leave = leave days where the user still logged in.
 */
export function presentAbsentFromDays(days = []) {
  let present = 0;
  let absent = 0;
  let leaveDays = 0;
  let leaveLogin = 0;
  for (const day of days) {
    if (isLeaveDayRow(day)) {
      leaveDays += 1;
      if (dayHasLogin(day)) leaveLogin += 1;
      continue;
    }
    if (dayHasLogin(day) || day.status === "half_leave") {
      // Half leave still counts as present for period cards (they logged in).
      present += 1;
      continue;
    }
    if (day.status === "absent") absent += 1;
  }
  return { present, absent, leave: leaveDays, leaveDays, leaveLogin };
}

export function presentAbsentFromSummary(summary, days) {
  if (Array.isArray(days) && days.length > 0) {
    return presentAbsentFromDays(days);
  }
  return {
    present: Number(summary?.daysPresent) || 0,
    absent: Number(summary?.daysAbsent) || 0,
    leave: Number(summary?.daysOnLeave) || 0,
    leaveDays: Number(summary?.daysOnLeave) || 0,
    leaveLogin: 0,
  };
}

function formatRangeLabel(fromDate, toDate) {
  if (!fromDate || !toDate) return "Selected range";
  if (fromDate === toDate) return fromDate;
  return `${fromDate} → ${toDate}`;
}

/**
 * Present / absent·leave / login-on-leave cards for the currently selected date range.
 */
export default function AttendancePeriodStats({
  present = 0,
  absent = 0,
  leave = 0,
  leaveDays = leave,
  leaveLogin = 0,
  fromDate = null,
  toDate = null,
  loading = false,
}) {
  if (loading) {
    return <p className="text-sm text-zinc-500">Loading present / absent…</p>;
  }

  const leaveCount = leaveDays ?? leave ?? 0;
  const leaveLoginCount = leaveLogin ?? 0;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {formatRangeLabel(fromDate, toDate)}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Present</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
            {present}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-rose-700 dark:text-rose-300">Absent / Leave</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-rose-900 dark:text-rose-100">
            <span title="Absent">{absent}</span>
            <span className="mx-0.5 font-semibold text-rose-400 dark:text-rose-500">/</span>
            <span title="Leave" className="text-amber-800 dark:text-amber-200">
              {leaveCount}
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Login on leave
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-amber-900 dark:text-amber-100">
            {leaveLoginCount}
          </p>
        </div>
      </div>
    </div>
  );
}
