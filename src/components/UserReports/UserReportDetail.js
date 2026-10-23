"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import UserNameLabel from "@/components/UserNameLabel";
import EtTimeWithTooltip from "@/components/EtTimeWithTooltip";
import LeadDetailPanel from "@/components/Leads/LeadDetailPanel";
import { formatDuration } from "@/lib/formatDuration";
import {
  ATTENDANCE_REPORT_TIMEZONE,
  ATTENDANCE_TZ_ET,
  ATTENDANCE_TZ_PKT,
  REPORT_EASTERN_TODAY_NOTICE,
  calendarDateInTimezone,
  formatAttendanceTimeEt,
  formatAttendanceTimePkt,
  formatReportWhenDual,
  getReportPresetRange,
} from "@/lib/attendanceTime";
import AttendanceStatusBadge from "@/components/Attendance/AttendanceStatusBadge";
import AttendancePeriodStats, {
  presentAbsentFromDays,
} from "@/components/Attendance/AttendancePeriodStats";
import {
  ActivityChevron,
  ActivityRowDetail,
  MetricStat,
  RoleBadge,
  UserCallLogCard,
  activityActionLabel,
  callsDateInputClass,
  detailChipClass,
  detailFilterLabelClass,
  formatActivityDetails,
  formatActivityLocation,
  truncateActivityText,
  userSelectClass,
} from "@/components/UserReports/userReportHelpers";

function formatOnlineMs(value) {
  const ms = Number(value) || 0;
  if (ms <= 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

const SHIFT_FILTER_OPTIONS = [
  { id: "all", label: "All shifts" },
  { id: "day", label: "Day" },
  { id: "night", label: "Night" },
];

const LOCATION_FILTER_OPTIONS = [
  { id: "all", label: "All locations" },
  { id: "in_house", label: "In-house" },
  { id: "outside", label: "Outside" },
];

const ROLE_FILTER_OPTIONS_ADMIN = [
  { id: "all", label: "All roles" },
  { id: "agent", label: "Agent" },
  { id: "supervisor", label: "Supervisor" },
  { id: "lead_supervisor", label: "Lead supervisor" },
  { id: "processor", label: "Processor" },
  { id: "manager", label: "Manager" },
  { id: "admin", label: "Admin" },
];

const ROLE_FILTER_OPTIONS_MANAGER = [
  { id: "all", label: "All roles" },
  { id: "agent", label: "Agent" },
  { id: "supervisor", label: "Supervisor" },
  { id: "lead_supervisor", label: "Lead supervisor" },
  { id: "processor", label: "Processor" },
];

function filterUsersList(users, { query, shiftKey, location, role }) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  return users.filter((u) => {
    if (shiftKey !== "all") {
      const key = u.shiftKey === "night" ? "night" : "day";
      if (u.role !== "admin" && key !== shiftKey) return false;
      if (u.role === "admin" && shiftKey !== "all") return false;
    }
    if (location === "outside" && !u.isOutside) return false;
    if (location === "in_house" && u.isOutside) return false;
    if (role !== "all" && u.role !== role) return false;
    if (!q) return true;
    const username = String(u.username || "").toLowerCase();
    const displayName = String(u.displayName || "").toLowerCase();
    return username.includes(q) || displayName.includes(q);
  });
}

function userOptionLabel(u) {
  const name = u.displayName ? `${u.displayName} (@${u.username})` : u.username;
  const shift = u.role === "admin" ? "—" : u.shiftKey === "night" ? "Night" : "Day";
  const loc = u.isOutside ? "Outside" : "In-house";
  return `${name} · ${shift} · ${loc}`;
}

const LEADS_PAGE_SIZE = 25;
const LEADS_FETCH_SIZE = 100;
const TIMELINE_PAGE_SIZE = 25;
const TIMELINE_FETCH_SIZE = 100;

function formatGapLabel(ms) {
  const n = Math.max(0, Number(ms) || 0);
  if (n < 1000) return "<1s";
  const sec = Math.floor(n / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  const remMin = min % 60;
  if (hours < 24) return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}

const pageNavBtnClass =
  "shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

function PageNav({ page, totalPages, hasPrev, hasNext, disabled = false, onPrev, onNext, className = "" }) {
  return (
    <div className={`flex shrink-0 flex-wrap items-center justify-end gap-1.5 ${className}`.trim()}>
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev || disabled}
        className={pageNavBtnClass}
      >
        Prev
      </button>
      <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
        {page}/{totalPages}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext || disabled}
        className={pageNavBtnClass}
      >
        Next
      </button>
    </div>
  );
}

const GAP_MS_5M = 5 * 60 * 1000;
const GAP_MS_30M = 30 * 60 * 1000;
const GAP_MS_2H = 2 * 60 * 60 * 1000;

/** Green <5m, yellow <30m, blue <2h, red ≥2h. */
function gapBadgeClass(ms) {
  const n = Math.max(0, Number(ms) || 0);
  if (n < GAP_MS_5M) {
    return {
      badge:
        "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200",
      line: "bg-emerald-200 dark:bg-emerald-800/70",
    };
  }
  if (n < GAP_MS_30M) {
    return {
      badge:
        "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200",
      line: "bg-amber-200 dark:bg-amber-800/70",
    };
  }
  if (n < GAP_MS_2H) {
    return {
      badge:
        "border-sky-300 bg-sky-100 text-sky-950 dark:border-sky-700 dark:bg-sky-950/60 dark:text-sky-200",
      line: "bg-sky-200 dark:bg-sky-800/70",
    };
  }
  return {
    badge:
      "border-red-300 bg-red-100 text-red-950 dark:border-red-700 dark:bg-red-950/60 dark:text-red-200",
    line: "bg-red-200 dark:bg-red-800/70",
  };
}

/** Readable clock for timeline — time only or with weekday/date. */
function formatTimelineClock(value, { timeOnly = false } = {}) {
  if (!value) return { et: "—", pkt: "—" };
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return { et: "—", pkt: "—" };
  try {
    const timeOpts = {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };
    const etTime = new Intl.DateTimeFormat("en-US", {
      ...timeOpts,
      timeZone: ATTENDANCE_TZ_ET,
    }).format(d);
    const pktTime = new Intl.DateTimeFormat("en-US", {
      ...timeOpts,
      timeZone: ATTENDANCE_TZ_PKT,
    }).format(d);
    if (timeOnly) {
      return { et: `${etTime} ET`, pkt: `${pktTime} PKT` };
    }
    const dateOpts = { weekday: "short", month: "short", day: "numeric" };
    const etDate = new Intl.DateTimeFormat("en-US", {
      ...dateOpts,
      timeZone: ATTENDANCE_TZ_ET,
    }).format(d);
    return {
      et: `${etTime} ET`,
      pkt: `${pktTime} PKT`,
      dateLabel: etDate,
    };
  } catch {
    return { et: "—", pkt: "—" };
  }
}

function formatTimelineDayHeading(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey || "—";
  const [y, m, day] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, day, 12));
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(utc);
  } catch {
    return dateKey;
  }
}

function TimelineWhen({ value, timeOnly }) {
  const clock = formatTimelineClock(value, { timeOnly });
  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5 text-right leading-tight">
      <span className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
        {clock.et}
      </span>
      <span className="text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
        {clock.pkt}
      </span>
    </span>
  );
}

function isInstantInDateRange(value, fromDate, toDate) {
  if (!value || !fromDate || !toDate) return false;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const key = calendarDateInTimezone(d, ATTENDANCE_REPORT_TIMEZONE);
  return key >= fromDate && key <= toDate;
}

function annotateLeadForRange(lead, fromDate, toDate) {
  const createdInRange = isInstantInDateRange(lead.createdAt, fromDate, toDate);
  const updatedInRange = isInstantInDateRange(lead.updatedAt, fromDate, toDate);
  return { ...lead, createdInRange, updatedInRange };
}

function mergeLeadsById(createdRows, updatedRows, fromDate, toDate) {
  const map = new Map();
  for (const row of [...createdRows, ...updatedRows]) {
    if (!row?.id) continue;
    if (!map.has(row.id)) map.set(row.id, row);
  }
  return [...map.values()]
    .map((lead) => annotateLeadForRange(lead, fromDate, toDate))
    .sort((a, b) => {
      const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return (Number.isNaN(bt) ? 0 : bt) - (Number.isNaN(at) ? 0 : at);
    });
}

async function fetchLeadsByDateField({ userId, fromDate, toDate, dateField, signal }) {
  const qs = new URLSearchParams({
    agentId: String(userId),
    page: "1",
    pageSize: String(LEADS_FETCH_SIZE),
  });
  if (fromDate && toDate) {
    qs.set("fromDate", fromDate);
    qs.set("toDate", toDate);
    qs.set("dateField", dateField);
  }
  const res = await fetch(`/api/leads?${qs.toString()}`, {
    credentials: "include",
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Failed to load leads");
  return json.leads || [];
}

const RANGE_PRESET_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "custom", label: "Custom" },
];

function resolveInitialRange(initialDate) {
  const today = getReportPresetRange("today");
  const yesterday = getReportPresetRange("yesterday");
  if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
    if (initialDate === today.from) return { preset: "today", from: today.from, to: today.to };
    if (initialDate === yesterday.from) {
      return { preset: "yesterday", from: yesterday.from, to: yesterday.to };
    }
    return { preset: "custom", from: initialDate, to: initialDate };
  }
  return { preset: "today", from: today.from, to: today.to };
}

function subTabClass(active, accent) {
  const activeMap = {
    emerald: "border-emerald-600 text-emerald-800 dark:border-emerald-500 dark:text-emerald-200",
    sky: "border-sky-600 text-sky-800 dark:border-sky-500 dark:text-sky-200",
    violet: "border-violet-600 text-violet-800 dark:border-violet-500 dark:text-violet-200",
    amber: "border-amber-600 text-amber-800 dark:border-amber-500 dark:text-amber-200",
  };
  return `shrink-0 border-b-2 px-3 py-1.5 text-sm font-semibold transition-colors sm:px-3.5 ${
    active
      ? activeMap[accent] || activeMap.emerald
      : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
  }`;
}

function chipActive(active, accent = "emerald") {
  if (!active) {
    return "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800";
  }
  if (accent === "violet") {
    return "border-violet-600 bg-violet-100 text-violet-950 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100";
  }
  if (accent === "sky") {
    return "border-sky-600 bg-sky-100 text-sky-950 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100";
  }
  return "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100";
}

/** Badge label + colors for timeline activity kinds (login → call → lead work). */
function timelineActivityKind(action) {
  const a = String(action || "");
  if (a === "login_success" || a === "leave_application_login" || a === "login_failed") {
    return {
      label: "Login",
      className:
        "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
    };
  }
  if (a === "logout") {
    return {
      label: "Logout",
      className: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
    };
  }
  if (a.startsWith("lead_")) {
    return {
      label: "Lead",
      className: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
    };
  }
  if (a.startsWith("leave_")) {
    return {
      label: "Leave",
      className: "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200",
    };
  }
  if (a.includes("after_shift") || a.includes("login_window")) {
    return {
      label: "Access",
      className: "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200",
    };
  }
  if (a === "text_copy" || a === "copy_blocked") {
    return {
      label: "Copy",
      className: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
    };
  }
  return {
    label: "Activity",
    className: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
  };
}

export default function UserReportDetail({
  user,
  users = [],
  viewerRole,
  currentUserId,
  onUserIdChange,
  initialDate,
}) {
  const isAdmin = viewerRole === "admin";
  const roleFilterOptions = isAdmin ? ROLE_FILTER_OPTIONS_ADMIN : ROLE_FILTER_OPTIONS_MANAGER;
  const isSelf = user?.id === currentUserId;

  const initial = useMemo(() => resolveInitialRange(initialDate), [initialDate]);

  const [activeTab, setActiveTab] = useState("timeline");
  const [rangePreset, setRangePreset] = useState(initial.preset);
  const [rangeFrom, setRangeFrom] = useState(initial.from);
  const [rangeTo, setRangeTo] = useState(initial.to);
  const [appliedFrom, setAppliedFrom] = useState(initial.from);
  const [appliedTo, setAppliedTo] = useState(initial.to);
  const [rangeError, setRangeError] = useState(null);

  // Timeline: login / logout / leads + calls (no phone), client-paginated
  const [allTimelineEvents, setAllTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState(null);
  const [timelinePage, setTimelinePage] = useState(1);

  // Calls
  const [calls, setCalls] = useState([]);
  const [callsError, setCallsError] = useState(null);
  const [callsLoading, setCallsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [callsFilter, setCallsFilter] = useState("all");
  const [callsLineFilter, setCallsLineFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [downloadingId, setDownloadingId] = useState(null);

  // Metrics
  const [metrics, setMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsScope, setMetricsScope] = useState("all");

  // Activity detail expand (inside Timeline)
  const [expandedActivityId, setExpandedActivityId] = useState(null);
  const [activityDetailCache, setActivityDetailCache] = useState({});
  const [activityDetailLoadingId, setActivityDetailLoadingId] = useState(null);
  const [activityDetailError, setActivityDetailError] = useState(null);

  // Leads (created ∪ updated in range, client-paginated)
  const [allLeads, setAllLeads] = useState([]);
  const [leadsError, setLeadsError] = useState(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsPage, setLeadsPage] = useState(1);
  const [selectedLead, setSelectedLead] = useState(null);
  const [loadingLeadId, setLoadingLeadId] = useState(null);

  // Attendance (per user, selected range)
  const [attendance, setAttendance] = useState(null);
  const [attendanceError, setAttendanceError] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [expandedAttendanceDate, setExpandedAttendanceDate] = useState(null);
  const [attendanceLoginCache, setAttendanceLoginCache] = useState({});
  const [attendanceLoginLoading, setAttendanceLoginLoading] = useState(null);

  // Range overview (always for selected user + range)
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewLeadsTotal, setOverviewLeadsTotal] = useState(null);

  // User list filters
  const [userSearch, setUserSearch] = useState("");
  const [userShiftFilter, setUserShiftFilter] = useState("all");
  const [userLocationFilter, setUserLocationFilter] = useState("all");
  const [userRoleFilter, setUserRoleFilter] = useState("all");

  const filteredUsers = useMemo(
    () =>
      filterUsersList(users, {
        query: userSearch,
        shiftKey: userShiftFilter,
        location: userLocationFilter,
        role: userRoleFilter,
      }),
    [users, userSearch, userShiftFilter, userLocationFilter, userRoleFilter],
  );

  useEffect(() => {
    if (!filteredUsers.length) return;
    if (user && filteredUsers.some((u) => u.id === user.id)) return;
    const nextId = filteredUsers[0]?.id;
    if (nextId == null || user?.id === nextId) return;
    if (typeof onUserIdChange === "function") {
      onUserIdChange(nextId);
    }
  }, [filteredUsers, user, onUserIdChange]);

  useEffect(() => {
    setActiveTab("timeline");
    setCallsFilter("all");
    setCallsLineFilter("all");
    setMetricsScope("all");
    const next = resolveInitialRange(initialDate);
    setRangePreset(next.preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
    setAppliedFrom(next.from);
    setAppliedTo(next.to);
    setRangeError(null);
    setPage(1);
    setLeadsPage(1);
    setTimelinePage(1);
    setMetrics(null);
    setAllTimelineEvents([]);
    setCalls([]);
    setAllLeads([]);
    setAttendance(null);
    setAttendanceError(null);
    setExpandedAttendanceDate(null);
    setAttendanceLoginCache({});
    setOverviewLeadsTotal(null);
    setExpandedActivityId(null);
    setActivityDetailCache({});
    setActivityDetailLoadingId(null);
    setActivityDetailError(null);
  }, [user?.id, initialDate]);

  useEffect(() => {
    if (!isAdmin && activeTab === "metrics") {
      setActiveTab("timeline");
    }
    if (activeTab === "activity") {
      setActiveTab("timeline");
    }
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (!user?.canUseDialer2 && callsLineFilter === "2") {
      setCallsLineFilter("all");
      setPage(1);
    }
  }, [user?.canUseDialer2, callsLineFilter]);

  const loadTimeline = useCallback(
    async (signal, fromDate = appliedFrom, toDate = appliedTo) => {
      if (!user?.id) return;
      setTimelineLoading(true);
      setTimelineError(null);
      try {
        const callQs = new URLSearchParams({
          page: "1",
          pageSize: String(TIMELINE_FETCH_SIZE),
        });
        if (fromDate && toDate) {
          callQs.set("fromDate", fromDate);
          callQs.set("toDate", toDate);
        }

        const callsPromise = fetch(`/api/users/${user.id}/calls?${callQs.toString()}`, {
          credentials: "include",
          signal,
        }).then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json?.error || "Failed to load calls");
          return json.calls || [];
        });

        const activitiesPromise =
          isAdmin && fromDate && toDate
            ? fetch(
                `/api/users/${user.id}/activities?${new URLSearchParams({
                  page: "1",
                  pageSize: String(TIMELINE_FETCH_SIZE),
                  fromDate,
                  toDate,
                }).toString()}`,
                { credentials: "include", signal },
              ).then(async (res) => {
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json?.error || "Failed to load activities");
                return json.activities || [];
              })
            : Promise.resolve([]);

        const [callRows, activityRows] = await Promise.all([callsPromise, activitiesPromise]);

        setExpandedActivityId(null);
        setActivityDetailCache({});
        setActivityDetailLoadingId(null);
        setActivityDetailError(null);

        const events = [
          ...activityRows.map((row) => ({
            kind: "activity",
            id: `activity-${row.id}`,
            createdAt: row.createdAt,
            row,
          })),
          ...callRows.map((row) => ({
            kind: "call",
            id: `call-${row.id}`,
            createdAt: row.createdAt,
            row,
          })),
        ].sort((a, b) => {
          const at = new Date(a.createdAt).getTime();
          const bt = new Date(b.createdAt).getTime();
          if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
          if (Number.isNaN(at)) return 1;
          if (Number.isNaN(bt)) return -1;
          // Oldest first (ascending)
          return at - bt;
        });

        setAllTimelineEvents(events);
        setTimelinePage(1);
      } catch (err) {
        if (err.name === "AbortError") return;
        setTimelineError(err.message || "Failed to load timeline");
        setAllTimelineEvents([]);
      } finally {
        setTimelineLoading(false);
      }
    },
    [user?.id, isAdmin, appliedFrom, appliedTo],
  );

  const loadCalls = useCallback(
    async (
      signal,
      nextPage = 1,
      filter = callsFilter,
      fromDate = appliedFrom,
      toDate = appliedTo,
      { silent = false, line = callsLineFilter } = {},
    ) => {
      if (!user?.id) return;
      if (silent) {
        setRefreshing(true);
      } else {
        setCallsLoading(true);
      }
      setCallsError(null);
      try {
        const qs = new URLSearchParams({
          page: String(nextPage),
          pageSize: "25",
        });
        if (fromDate && toDate) {
          qs.set("fromDate", fromDate);
          qs.set("toDate", toDate);
        }
        if (filter === "recording") qs.set("hasRecording", "true");
        if (filter === "conference") qs.set("scope", "conference");
        if (line === "1" || line === "2") qs.set("dialerIndex", line);

        const res = await fetch(`/api/users/${user.id}/calls?${qs.toString()}`, {
          credentials: "include",
          signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load call logs");
        setCalls(json.calls || []);
        if (json.pagination) {
          setPagination(json.pagination);
          setPage(json.pagination.page || nextPage);
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        setCallsError(err.message || "Failed to load call logs");
        setCalls([]);
      } finally {
        if (silent) setRefreshing(false);
        else setCallsLoading(false);
      }
    },
    [user?.id, callsFilter, callsLineFilter, appliedFrom, appliedTo],
  );

  const loadMetrics = useCallback(
    async (signal, fromDate = appliedFrom, toDate = appliedTo, scope = metricsScope) => {
      if (!isAdmin || !user?.id) return;
      setMetricsLoading(true);
      setMetricsError(null);
      try {
        const qs = new URLSearchParams({ fromDate, toDate });
        if (scope === "conference") qs.set("scope", "conference");
        const res = await fetch(`/api/users/${user.id}/metrics?${qs.toString()}`, {
          credentials: "include",
          signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load metrics");
        setMetrics(json.metrics || null);
      } catch (err) {
        if (err.name === "AbortError") return;
        setMetricsError(err.message || "Failed to load metrics");
        setMetrics(null);
      } finally {
        setMetricsLoading(false);
      }
    },
    [user?.id, isAdmin, appliedFrom, appliedTo, metricsScope],
  );

  const loadLeads = useCallback(
    async (signal, fromDate = appliedFrom, toDate = appliedTo) => {
      if (!user?.id) return;
      setLeadsLoading(true);
      setLeadsError(null);
      try {
        const [createdRows, updatedRows] = await Promise.all([
          fetchLeadsByDateField({
            userId: user.id,
            fromDate,
            toDate,
            dateField: "created",
            signal,
          }),
          fetchLeadsByDateField({
            userId: user.id,
            fromDate,
            toDate,
            dateField: "updated",
            signal,
          }),
        ]);
        const merged = mergeLeadsById(createdRows, updatedRows, fromDate, toDate);
        setAllLeads(merged);
        setOverviewLeadsTotal(merged.length);
        setLeadsPage(1);
      } catch (err) {
        if (err.name === "AbortError") return;
        setLeadsError(err.message || "Failed to load leads");
        setAllLeads([]);
        setOverviewLeadsTotal(0);
      } finally {
        setLeadsLoading(false);
      }
    },
    [user?.id, appliedFrom, appliedTo],
  );

  const loadAttendance = useCallback(
    async (signal, fromDate = appliedFrom, toDate = appliedTo) => {
      if (!user?.id || !fromDate || !toDate) return;
      setAttendanceLoading(true);
      setAttendanceError(null);
      try {
        const qs = new URLSearchParams({
          fromDate,
          toDate,
          userId: String(user.id),
        });
        const res = await fetch(`/api/attendance?${qs.toString()}`, {
          credentials: "include",
          signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load attendance");
        setAttendance(json);
        setExpandedAttendanceDate(null);
        setAttendanceLoginCache({});
      } catch (err) {
        if (err.name === "AbortError") return;
        setAttendanceError(err.message || "Failed to load attendance");
        setAttendance(null);
      } finally {
        setAttendanceLoading(false);
      }
    },
    [user?.id, appliedFrom, appliedTo],
  );

  /** Load range snapshot used above the tabs (attendance + metrics + leads count). */
  const loadOverview = useCallback(
    async (signal, fromDate = appliedFrom, toDate = appliedTo) => {
      if (!user?.id || !fromDate || !toDate) return;
      setOverviewLoading(true);
      try {
        const attQs = new URLSearchParams({
          fromDate,
          toDate,
          userId: String(user.id),
        });
        const attendancePromise = fetch(`/api/attendance?${attQs}`, {
          credentials: "include",
          signal,
        }).then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json?.error || "Failed to load attendance");
          return json;
        });

        const leadsPromise = Promise.all([
          fetchLeadsByDateField({
            userId: user.id,
            fromDate,
            toDate,
            dateField: "created",
            signal,
          }).catch(() => []),
          fetchLeadsByDateField({
            userId: user.id,
            fromDate,
            toDate,
            dateField: "updated",
            signal,
          }).catch(() => []),
        ]).then(([createdRows, updatedRows]) =>
          mergeLeadsById(createdRows, updatedRows, fromDate, toDate),
        );

        const metricsPromise = isAdmin
          ? fetch(
              `/api/users/${user.id}/metrics?${new URLSearchParams({
                fromDate,
                toDate,
              })}`,
              { credentials: "include", signal },
            ).then(async (res) => {
              const json = await res.json().catch(() => ({}));
              if (!res.ok) return null;
              return json.metrics || null;
            })
          : Promise.resolve(null);

        const [att, mergedLeads, metricsInfo] = await Promise.all([
          attendancePromise,
          leadsPromise,
          metricsPromise,
        ]);
        setAttendance(att);
        setOverviewLeadsTotal(mergedLeads.length);
        if (isAdmin && metricsInfo) setMetrics(metricsInfo);
      } catch (err) {
        if (err.name === "AbortError") return;
        setAttendanceError(err.message || "Failed to load overview");
      } finally {
        setOverviewLoading(false);
      }
    },
    [user?.id, isAdmin, appliedFrom, appliedTo],
  );

  useEffect(() => {
    if (!user?.id || !appliedFrom || !appliedTo) return undefined;
    const controller = new AbortController();
    loadOverview(controller.signal);
    return () => controller.abort();
  }, [user?.id, appliedFrom, appliedTo, loadOverview]);

  useEffect(() => {
    if (activeTab !== "timeline") return undefined;
    const controller = new AbortController();
    loadTimeline(controller.signal, appliedFrom, appliedTo);
    return () => controller.abort();
  }, [activeTab, loadTimeline, user?.id, appliedFrom, appliedTo]);

  useEffect(() => {
    if (activeTab !== "calls") return undefined;
    const controller = new AbortController();
    loadCalls(controller.signal, page, callsFilter, appliedFrom, appliedTo);
    return () => controller.abort();
  }, [activeTab, user?.id, callsFilter, callsLineFilter, appliedFrom, appliedTo, page, loadCalls]);

  useEffect(() => {
    if (!isAdmin || activeTab !== "metrics") return undefined;
    const controller = new AbortController();
    loadMetrics(controller.signal, appliedFrom, appliedTo, metricsScope);
    return () => controller.abort();
  }, [user?.id, isAdmin, activeTab, appliedFrom, appliedTo, metricsScope, loadMetrics]);

  useEffect(() => {
    if (activeTab !== "leads") return undefined;
    const controller = new AbortController();
    loadLeads(controller.signal, appliedFrom, appliedTo);
    return () => controller.abort();
  }, [activeTab, user?.id, appliedFrom, appliedTo, loadLeads]);

  useEffect(() => {
    if (activeTab !== "attendance") return undefined;
    const controller = new AbortController();
    loadAttendance(controller.signal);
    return () => controller.abort();
  }, [activeTab, user?.id, appliedFrom, appliedTo, loadAttendance]);

  function applyPreset(preset) {
    setRangePreset(preset);
    setRangeError(null);
    if (preset === "custom") return;
    const next = getReportPresetRange(preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
    setAppliedFrom(next.from);
    setAppliedTo(next.to);
    setPage(1);
    setLeadsPage(1);
    setTimelinePage(1);
  }

  function onApplyRange() {
    if (rangePreset !== "custom") return;
    if (!rangeFrom || !rangeTo) {
      setRangeError("From date and to date are required");
      return;
    }
    if (rangeFrom > rangeTo) {
      setRangeError("From date must be on or before to date");
      return;
    }
    setRangeError(null);
    setAppliedFrom(rangeFrom);
    setAppliedTo(rangeTo);
    setPage(1);
    setLeadsPage(1);
    setTimelinePage(1);
  }

  async function onRefreshCalls() {
    const controller = new AbortController();
    await loadCalls(controller.signal, page, callsFilter, appliedFrom, appliedTo, {
      silent: calls.length > 0,
    });
  }

  async function downloadRecording(callId, url) {
    if (!url) return;
    setDownloadingId(callId);
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || "Failed to download recording");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const filename = match?.[1] || `recording-call-${callId}.mp3`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setCallsError(err?.message || "Failed to download recording");
    } finally {
      setDownloadingId(null);
    }
  }

  async function toggleActivityRow(activityId) {
    if (!isAdmin) return;
    if (expandedActivityId === activityId) {
      setExpandedActivityId(null);
      setActivityDetailError(null);
      setActivityDetailLoadingId(null);
      return;
    }
    setExpandedActivityId(activityId);
    setActivityDetailError(null);
    if (activityDetailCache[activityId]) return;

    setActivityDetailLoadingId(activityId);
    try {
      const res = await fetch(`/api/users/${user.id}/activities/${activityId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load activity detail");
      setActivityDetailCache((prev) => ({ ...prev, [activityId]: json.activity || null }));
    } catch (err) {
      setActivityDetailError(err.message || "Failed to load activity detail");
    } finally {
      setActivityDetailLoadingId((current) => (current === activityId ? null : current));
    }
  }

  async function openLeadSidebar(leadId) {
    const id = Number(leadId);
    if (!Number.isInteger(id) || id < 1) return;
    setLoadingLeadId(id);
    setLeadsError(null);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load sale");
      setSelectedLead(json.lead || null);
    } catch (err) {
      setLeadsError(err?.message || "Failed to load sale");
      setSelectedLead(null);
    } finally {
      setLoadingLeadId(null);
    }
  }

  async function toggleAttendanceDay(date) {
    if (expandedAttendanceDate === date) {
      setExpandedAttendanceDate(null);
      return;
    }
    setExpandedAttendanceDate(date);
    if (attendanceLoginCache[date]) return;
    setAttendanceLoginLoading(date);
    try {
      const params = new URLSearchParams({ date, userId: String(user.id) });
      const res = await fetch(`/api/attendance/logins?${params}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setAttendanceLoginCache((prev) => ({ ...prev, [date]: json.logins || [] }));
      }
    } finally {
      setAttendanceLoginLoading(null);
    }
  }

  const leadsPagination = useMemo(() => {
    const total = allLeads.length;
    const totalPages = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE) || 1);
    const page = Math.min(Math.max(1, leadsPage), totalPages);
    return {
      page,
      pageSize: LEADS_PAGE_SIZE,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }, [allLeads, leadsPage]);

  const leads = useMemo(() => {
    const start = (leadsPagination.page - 1) * LEADS_PAGE_SIZE;
    return allLeads.slice(start, start + LEADS_PAGE_SIZE);
  }, [allLeads, leadsPagination.page]);

  const timelinePagination = useMemo(() => {
    const total = allTimelineEvents.length;
    const totalPages = Math.max(1, Math.ceil(total / TIMELINE_PAGE_SIZE) || 1);
    const page = Math.min(Math.max(1, timelinePage), totalPages);
    return {
      page,
      pageSize: TIMELINE_PAGE_SIZE,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }, [allTimelineEvents, timelinePage]);

  const timelineEvents = useMemo(() => {
    const start = (timelinePagination.page - 1) * TIMELINE_PAGE_SIZE;
    return allTimelineEvents.slice(start, start + TIMELINE_PAGE_SIZE);
  }, [allTimelineEvents, timelinePagination.page]);

  const timelineTimeOnly = Boolean(appliedFrom && appliedTo && appliedFrom === appliedTo);
  const timelineShowDaySeparators = Boolean(
    appliedFrom && appliedTo && appliedFrom !== appliedTo,
  );

  const timelineDisplayRows = useMemo(() => {
    const rows = [];
    timelineEvents.forEach((event, index) => {
      const dateKey = calendarDateInTimezone(
        event.createdAt ? new Date(event.createdAt) : new Date(),
        ATTENDANCE_REPORT_TIMEZONE,
      );
      if (timelineShowDaySeparators) {
        const prev = timelineEvents[index - 1];
        const prevKey = prev
          ? calendarDateInTimezone(new Date(prev.createdAt), ATTENDANCE_REPORT_TIMEZONE)
          : null;
        if (dateKey !== prevKey) {
          rows.push({ type: "date", key: `date-${dateKey}-${index}`, dateKey });
        }
      }
      if (index > 0) {
        const earlier = timelineEvents[index - 1];
        const earlierDateKey = calendarDateInTimezone(
          new Date(earlier.createdAt),
          ATTENDANCE_REPORT_TIMEZONE,
        );
        // Skip overnight / cross-day gaps (e.g. "21h later") — day separators cover that.
        if (earlierDateKey === dateKey) {
          const earlierMs = new Date(earlier.createdAt).getTime();
          const thisMs = new Date(event.createdAt).getTime();
          const gapMs =
            Number.isFinite(earlierMs) && Number.isFinite(thisMs)
              ? Math.max(0, thisMs - earlierMs)
              : 0;
          rows.push({ type: "gap", key: `gap-${event.id}`, gapMs });
        }
      }
      rows.push({ type: "event", key: event.id, event });
    });
    return rows;
  }, [timelineEvents, timelineShowDaySeparators]);

  const attendanceDays = attendance?.days || [];
  const attendanceRangeStats = presentAbsentFromDays(attendanceDays);
  const totalOnlineMs = attendanceDays.reduce((sum, d) => sum + (Number(d.onlineMs) || 0), 0);
  const totalDesktopMs = attendanceDays.reduce(
    (sum, d) => sum + (Number(d.desktopOnlineMs) || 0),
    0,
  );
  const totalMobileMs = attendanceDays.reduce((sum, d) => sum + (Number(d.mobileOnlineMs) || 0), 0);

  const rangeBusy =
    timelineLoading ||
    callsLoading ||
    metricsLoading ||
    attendanceLoading ||
    overviewLoading ||
    leadsLoading;

  const hasActiveUserFilters =
    Boolean(userSearch.trim()) ||
    userShiftFilter !== "all" ||
    userLocationFilter !== "all" ||
    userRoleFilter !== "all";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      {/* User filters + select */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-2.5 dark:border-zinc-700 dark:bg-zinc-900/50">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="user-report-user-search" className={detailFilterLabelClass}>
              Search name
            </label>
            <input
              id="user-report-user-search"
              type="search"
              className={callsDateInputClass}
              placeholder="Username or display name"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="user-report-shift-filter" className={detailFilterLabelClass}>
              Shift
            </label>
            <select
              id="user-report-shift-filter"
              className={userSelectClass}
              value={userShiftFilter}
              onChange={(e) => setUserShiftFilter(e.target.value)}
            >
              {SHIFT_FILTER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="user-report-location-filter" className={detailFilterLabelClass}>
              Location
            </label>
            <select
              id="user-report-location-filter"
              className={userSelectClass}
              value={userLocationFilter}
              onChange={(e) => setUserLocationFilter(e.target.value)}
            >
              {LOCATION_FILTER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="user-report-role-filter" className={detailFilterLabelClass}>
              Role
            </label>
            <select
              id="user-report-role-filter"
              className={userSelectClass}
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
            >
              {roleFilterOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[14rem] flex-1 sm:max-w-sm">
            <label htmlFor="user-report-user-select" className={detailFilterLabelClass}>
              User ({filteredUsers.length})
            </label>
            <select
              id="user-report-user-select"
              className={userSelectClass}
              value={user?.id ?? ""}
              disabled={filteredUsers.length === 0}
              onChange={(e) => {
                const id = Number(e.target.value);
                if (Number.isInteger(id) && id > 0 && typeof onUserIdChange === "function") {
                  onUserIdChange(id);
                }
              }}
            >
              {filteredUsers.length === 0 ? (
                <option value="">No users match filters</option>
              ) : (
                filteredUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userOptionLabel(u)}
                  </option>
                ))
              )}
            </select>
          </div>
          {hasActiveUserFilters ? (
            <button
              type="button"
              onClick={() => {
                setUserSearch("");
                setUserShiftFilter("all");
                setUserLocationFilter("all");
                setUserRoleFilter("all");
              }}
              className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {!user ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {filteredUsers.length === 0
            ? "No users match these filters."
            : "Select a user to view reports."}
        </p>
      ) : null}

      {user ? (
        <>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            <UserNameLabel
              displayName={user.displayName}
              username={user.username}
              displayClassName="text-lg font-semibold leading-tight text-zinc-950 dark:text-zinc-50"
              usernameClassName="text-sm font-normal text-zinc-400 dark:text-zinc-500"
              truncate={false}
            />
            {isSelf ? (
              <span className="ml-2 text-xs font-normal text-zinc-500">(you)</span>
            ) : null}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RoleBadge value={user.role} />
            {user.role !== "admin" ? (
              <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                {user.shiftKey === "night" ? "Night shift" : "Day shift"}
              </span>
            ) : null}
            {user.isOutside ? (
              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                Outside
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                In-house
              </span>
            )}
            {user.canUseDialer2 ? (
              <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
                Line 2
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Shared date range */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-2.5 dark:border-zinc-700 dark:bg-zinc-900/50">
        <div className="mb-2 flex flex-wrap items-end gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <label className={detailFilterLabelClass}>Range</label>
            <div className="flex flex-wrap gap-1.5">
              {RANGE_PRESET_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`${detailChipClass} ${chipActive(rangePreset === p.id)}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="user-report-from-date" className={detailFilterLabelClass}>
                From
              </label>
              <input
                id="user-report-from-date"
                type="date"
                className={`${callsDateInputClass} w-[9.5rem]`}
                value={rangeFrom}
                disabled={rangePreset !== "custom"}
                onChange={(e) => {
                  setRangePreset("custom");
                  setRangeFrom(e.target.value);
                }}
                required
              />
            </div>
            <div>
              <label htmlFor="user-report-to-date" className={detailFilterLabelClass}>
                To
              </label>
              <input
                id="user-report-to-date"
                type="date"
                className={`${callsDateInputClass} w-[9.5rem]`}
                value={rangeTo}
                disabled={rangePreset !== "custom"}
                onChange={(e) => {
                  setRangePreset("custom");
                  setRangeTo(e.target.value);
                }}
                required
              />
            </div>
            <button
              type="button"
              onClick={onApplyRange}
              disabled={rangeBusy || rangePreset !== "custom"}
              className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
        <p
          role="status"
          className="inline-flex max-w-full items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <span className="shrink-0 font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            Note
          </span>
          <span>{REPORT_EASTERN_TODAY_NOTICE}</span>
        </p>
        {rangeError ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-300">{rangeError}</p>
        ) : null}
        {appliedFrom && appliedTo ? (
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            Showing {appliedFrom}
            {appliedFrom !== appliedTo ? ` → ${appliedTo}` : ""} (US Eastern)
          </p>
        ) : null}
      </div>

      {/* Range overview for selected user */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Selected range snapshot
          {overviewLoading ? " · Loading…" : ""}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <MetricStat label="Present days" value={attendanceRangeStats.present} />
          <MetricStat
            label="Absent / Leave"
            value={`${attendanceRangeStats.absent}/${attendanceRangeStats.leaveDays ?? attendanceRangeStats.leave ?? 0}`}
          />
          <MetricStat label="Online time" value={formatOnlineMs(totalOnlineMs)} />
          <MetricStat
            label="Desktop / Mobile"
            value={`${formatOnlineMs(totalDesktopMs)} / ${formatOnlineMs(totalMobileMs)}`}
          />
          {isAdmin ? (
            <MetricStat label="Calls" value={metrics?.total ?? (overviewLoading ? "…" : 0)} />
          ) : null}
          {isAdmin ? (
            <MetricStat
              label="Call duration"
              value={formatDuration(metrics?.durationSeconds)}
            />
          ) : null}
            <MetricStat
              label="Leads (created/updated)"
              value={overviewLeadsTotal == null ? (overviewLoading ? "…" : "—") : overviewLeadsTotal}
            />
        </div>
        {attendanceError ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-300">{attendanceError}</p>
        ) : null}
      </div>

      {/* Sub-tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setActiveTab("timeline")}
            className={subTabClass(activeTab === "timeline", "sky")}
          >
            Timeline
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("attendance")}
            className={subTabClass(activeTab === "attendance", "emerald")}
          >
            Attendance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("calls")}
            className={subTabClass(activeTab === "calls", "emerald")}
          >
            Call logs
          </button>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setActiveTab("metrics")}
              className={subTabClass(activeTab === "metrics", "violet")}
            >
              Metrics
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setActiveTab("leads")}
            className={subTabClass(activeTab === "leads", "amber")}
          >
            Leads
          </button>
        </div>
      </div>

      {/* Tab panels */}
      {activeTab === "timeline" ? (
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Timeline</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Login, logout, leads
                {isAdmin ? ", and other activity" : ""}
                , plus calls. Oldest first.
              </p>
            </div>
            <PageNav
              page={timelinePagination.page}
              totalPages={timelinePagination.totalPages}
              hasPrev={timelinePagination.hasPrev}
              hasNext={timelinePagination.hasNext}
              disabled={timelineLoading}
              onPrev={() => {
                if (!timelinePagination.hasPrev || timelineLoading) return;
                setTimelinePage(Math.max(1, timelinePagination.page - 1));
              }}
              onNext={() => {
                if (!timelinePagination.hasNext || timelineLoading) return;
                setTimelinePage(timelinePagination.page + 1);
              }}
            />
          </div>
          {timelineError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {timelineError}
            </p>
          ) : null}
          {timelineLoading && allTimelineEvents.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading timeline…</p>
          ) : allTimelineEvents.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              No events for this user in this date range.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
              <ul className="flex flex-col">
                {timelineDisplayRows.map((row) => {
                  if (row.type === "date") {
                    return (
                      <li
                        key={row.key}
                        className="sticky top-0 z-[1] border-y border-sky-200/80 bg-sky-50 px-3 py-2 dark:border-sky-900/50 dark:bg-sky-950/40"
                      >
                        <p className="text-sm font-semibold tracking-tight text-sky-950 dark:text-sky-100">
                          {formatTimelineDayHeading(row.dateKey)}
                        </p>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-sky-700/80 dark:text-sky-300/80">
                          US Eastern day
                        </p>
                      </li>
                    );
                  }
                  if (row.type === "gap") {
                    const gapTone = gapBadgeClass(row.gapMs);
                    return (
                      <li
                        key={row.key}
                        className="flex items-center gap-2 bg-zinc-50/90 px-3 py-1 dark:bg-zinc-900/60"
                        aria-label={`${formatGapLabel(row.gapMs)} between activities`}
                      >
                        <span className={`h-px flex-1 ${gapTone.line}`} />
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${gapTone.badge}`}
                        >
                          {formatGapLabel(row.gapMs)} later
                        </span>
                        <span className={`h-px flex-1 ${gapTone.line}`} />
                      </li>
                    );
                  }

                  const event = row.event;
                  if (event.kind === "activity") {
                    const activity = event.row;
                    const kind = timelineActivityKind(activity.action);
                    const detailsFull = formatActivityDetails(
                      activity.metadata,
                      activity.entityType,
                      activity.entityId,
                    );
                    const open = expandedActivityId === activity.id;
                    return (
                      <li
                        key={row.key}
                        className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                      >
                        <button
                          type="button"
                          onClick={() => void toggleActivityRow(activity.id)}
                          className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                            open
                              ? "bg-sky-50/90 dark:bg-sky-950/35"
                              : "hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                          }`}
                          aria-expanded={open}
                        >
                          <span
                            className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${kind.className}`}
                          >
                            <ActivityChevron open={open} />
                            {kind.label}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                              {activityActionLabel(activity.action, activity.metadata)}
                            </span>
                            {detailsFull && detailsFull !== "—" ? (
                              <span className="mt-0.5 block text-xs leading-snug text-zinc-600 dark:text-zinc-400">
                                {truncateActivityText(detailsFull, 96)}
                              </span>
                            ) : null}
                          </span>
                          <TimelineWhen value={activity.createdAt} timeOnly={timelineTimeOnly} />
                        </button>
                        {open ? (
                          <div className="border-t border-zinc-100 bg-zinc-50/90 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
                            {activityDetailLoadingId === activity.id ? (
                              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                                Loading record…
                              </p>
                            ) : activityDetailError && !activityDetailCache[activity.id] ? (
                              <p className="text-xs text-red-700 dark:text-red-300">
                                {activityDetailError}
                              </p>
                            ) : activityDetailCache[activity.id] ? (
                              <ActivityRowDetail row={activityDetailCache[activity.id]} />
                            ) : (
                              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                                No record found.
                              </p>
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  }

                  const call = event.row;
                  const isZoomCall = call.voiceProvider === "zoom";
                  return (
                    <li
                      key={row.key}
                      className="flex items-start gap-3 border-b border-zinc-100 px-3 py-2.5 last:border-b-0 dark:border-zinc-800"
                    >
                      <span className="mt-0.5 inline-flex shrink-0 rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                        Call
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                            {call.toNumber || "Unknown number"}
                          </span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              isZoomCall
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200"
                                : "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200"
                            }`}
                            title={isZoomCall ? "Zoom Phone Soft Embed" : "Twilio Voice"}
                          >
                            {isZoomCall ? "Zoom" : "Twilio"}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-400">
                          {call.status || "—"} · {formatDuration(call.durationSeconds)}
                          {Number(call.dialerIndex) === 2 ? " · Line 2" : ""}
                        </span>
                      </span>
                      <TimelineWhen value={call.createdAt} timeOnly={timelineTimeOnly} />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {!timelineLoading && !timelineError && allTimelineEvents.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Showing {timelineEvents.length} of {timelinePagination.total} events
                {timelineTimeOnly ? " · times only (single day)" : ""}
                {timelineShowDaySeparators ? " · grouped by Eastern date" : ""}
              </p>
              <PageNav
                page={timelinePagination.page}
                totalPages={timelinePagination.totalPages}
                hasPrev={timelinePagination.hasPrev}
                hasNext={timelinePagination.hasNext}
                disabled={timelineLoading}
                onPrev={() => {
                  if (!timelinePagination.hasPrev || timelineLoading) return;
                  setTimelinePage(Math.max(1, timelinePagination.page - 1));
                }}
                onNext={() => {
                  if (!timelinePagination.hasNext || timelineLoading) return;
                  setTimelinePage(timelinePagination.page + 1);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "attendance" ? (
        <div className="flex min-h-0 flex-col gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Attendance & online time
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Daily login status and desktop / mobile / total online time for this user in the
              selected range. Click a day for login events.
            </p>
          </div>
          <AttendancePeriodStats
            present={attendanceRangeStats.present}
            absent={attendanceRangeStats.absent}
            leave={attendanceRangeStats.leaveDays ?? attendanceRangeStats.leave}
            leaveLogin={attendanceRangeStats.leaveLogin}
            fromDate={appliedFrom}
            toDate={appliedTo}
            loading={attendanceLoading && !attendance}
          />
          {attendanceError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {attendanceError}
            </p>
          ) : null}
          {attendanceLoading && !attendance ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading attendance…</p>
          ) : attendanceDays.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              No attendance days for this range.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                    <th className="px-2.5 py-2">Date</th>
                    <th className="px-2.5 py-2">First login (PKT)</th>
                    <th className="px-2.5 py-2">First login (ET)</th>
                    <th className="px-2.5 py-2">Status</th>
                    <th className="px-2.5 py-2 text-right">Desktop</th>
                    <th className="px-2.5 py-2 text-right">Mobile</th>
                    <th className="px-2.5 py-2 text-right">Online</th>
                    <th className="px-2.5 py-2 text-right">Logins</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {attendanceDays.map((day) => {
                    const open = expandedAttendanceDate === day.date;
                    return (
                      <Fragment key={day.date}>
                        <tr
                          className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                          onClick={() => void toggleAttendanceDay(day.date)}
                        >
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-zinc-800 dark:text-zinc-200">
                            {day.date}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                            {formatAttendanceTimePkt(day.firstLoginAt)}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                            {formatAttendanceTimeEt(day.firstLoginAt)}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <AttendanceStatusBadge day={day} />
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-200">
                            {formatOnlineMs(day.desktopOnlineMs)}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-200">
                            {formatOnlineMs(day.mobileOnlineMs)}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums font-medium text-zinc-800 dark:text-zinc-100">
                            {formatOnlineMs(day.onlineMs)}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-200">
                            {day.loginCount ?? 0}
                          </td>
                        </tr>
                        {open ? (
                          <tr className="bg-zinc-50/80 dark:bg-zinc-900/40">
                            <td colSpan={8} className="px-2.5 py-2 text-xs text-zinc-600 dark:text-zinc-300">
                              {attendanceLoginLoading === day.date ? (
                                <p>Loading logins…</p>
                              ) : (attendanceLoginCache[day.date]?.length ?? 0) === 0 ? (
                                <p>No login events</p>
                              ) : (
                                <ul className="space-y-1">
                                  {(attendanceLoginCache[day.date] || []).map((login) => (
                                    <li key={login.id}>
                                      {formatReportWhenDual(login.createdAt) || "—"} —{" "}
                                      {login.deviceLabel || "Unknown"} —{" "}
                                      {login.location || "Unknown location"}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "metrics" && isAdmin ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <div>
            <label className={detailFilterLabelClass}>Call scope</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setMetricsScope("all")}
                className={`${detailChipClass} ${chipActive(metricsScope === "all", "violet")}`}
              >
                All calls
              </button>
              <button
                type="button"
                onClick={() => setMetricsScope("conference")}
                className={`${detailChipClass} ${chipActive(metricsScope === "conference", "violet")}`}
              >
                Conference calls
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Outbound calls placed by this user in the selected date range.
            </p>
          </div>
          {metricsError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {metricsError}
            </p>
          ) : null}
          {metricsLoading ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading metrics…</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MetricStat label="Total calls" value={metrics?.total ?? 0} />
              <MetricStat label="Completed" value={metrics?.completed ?? 0} />
              <MetricStat label="No answer" value={metrics?.noAnswer ?? 0} />
              <MetricStat label="Failed/Canceled" value={metrics?.failedOrCanceled ?? 0} />
              <MetricStat label="Busy" value={metrics?.busy ?? 0} />
              <MetricStat label="Total duration" value={formatDuration(metrics?.durationSeconds)} />
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "calls" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {callsFilter === "conference" ? "Conference call logs" : "Recent call logs"}
                </h3>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[
                    { id: "all", label: "All calls" },
                    { id: "recording", label: "With recording" },
                    { id: "conference", label: "Conference" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setCallsFilter(opt.id);
                        setPage(1);
                      }}
                      className={`${detailChipClass} ${chipActive(callsFilter === opt.id)}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Line
                  </span>
                  {[
                    { id: "all", label: "All" },
                    { id: "1", label: "1" },
                    ...(user.canUseDialer2 ? [{ id: "2", label: "2" }] : []),
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setCallsLineFilter(opt.id);
                        setPage(1);
                      }}
                      className={`${detailChipClass} ${chipActive(callsLineFilter === opt.id, "violet")}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {callsFilter === "conference" ? (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Invites via “Add agent”, or conferences this user joined.
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                <PageNav
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  hasPrev={pagination.hasPrev}
                  hasNext={pagination.hasNext}
                  disabled={callsLoading || refreshing}
                  onPrev={() => {
                    if (!pagination.hasPrev || callsLoading || refreshing) return;
                    setPage(Math.max(1, page - 1));
                  }}
                  onNext={() => {
                    if (!pagination.hasNext || callsLoading || refreshing) return;
                    setPage(page + 1);
                  }}
                />
                <button
                  type="button"
                  onClick={() => void onRefreshCalls()}
                  disabled={callsLoading || refreshing}
                  className="shrink-0 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                >
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>
          </div>

          {callsError ? (
            <p className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {callsError}
            </p>
          ) : null}

          {callsLoading && calls.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading call logs…</p>
          ) : calls.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {callsFilter === "recording"
                ? "No calls with a recording for this user in this date range."
                : callsFilter === "conference"
                  ? "No conference calls for this user in this date range."
                  : callsLineFilter === "2"
                    ? "No Line 2 calls for this user in this date range."
                    : callsLineFilter === "1"
                      ? "No Line 1 calls for this user in this date range."
                      : "No call logs for this user in this date range."}
            </p>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto md:hidden">
                {calls.map((c) => (
                  <UserCallLogCard
                    key={c.id}
                    call={c}
                    isAdmin={isAdmin}
                    showConferenceColumn={callsFilter === "conference"}
                    onDownload={downloadRecording}
                    downloadingId={downloadingId}
                  />
                ))}
              </div>
              <div className="hidden min-h-0 flex-1 overflow-auto md:block">
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <table className="w-full min-w-[48rem] text-left text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                        <th className="whitespace-nowrap px-2.5 py-2">When</th>
                        <th className="whitespace-nowrap px-2.5 py-2">Line</th>
                        {callsFilter === "conference" ? (
                          <th className="px-2.5 py-2">Invited</th>
                        ) : null}
                        <th className="px-2.5 py-2">To</th>
                        <th className="px-2.5 py-2">Status</th>
                        {isAdmin ? (
                          <>
                            <th className="whitespace-nowrap px-2.5 py-2">Agent</th>
                            <th className="whitespace-nowrap px-2.5 py-2">Customer</th>
                            <th className="whitespace-nowrap px-2.5 py-2">Total</th>
                          </>
                        ) : (
                          <th className="whitespace-nowrap px-2.5 py-2">Duration</th>
                        )}
                        <th className="whitespace-nowrap px-2.5 py-2">Recording</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {calls.map((c) => (
                        <tr key={c.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40">
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-zinc-700 dark:text-zinc-200">
                            <EtTimeWithTooltip value={c.createdAt} />
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                Number(c.dialerIndex) === 2
                                  ? "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200"
                                  : "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200"
                              }`}
                            >
                              {Number(c.dialerIndex) === 2 ? "Line 2" : "Line 1"}
                            </span>
                          </td>
                          {callsFilter === "conference" ? (
                            <td className="max-w-[10rem] truncate px-2.5 py-1.5 text-zinc-700 dark:text-zinc-200">
                              {Array.isArray(c.invitedToNames) && c.invitedToNames.length > 0
                                ? c.invitedToNames.join(", ")
                                : "—"}
                            </td>
                          ) : null}
                          <td className="whitespace-nowrap px-2.5 py-1.5 font-medium text-zinc-900 dark:text-zinc-100">
                            {c.toNumber || "—"}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-zinc-700 dark:text-zinc-200">
                            {c.status || "—"}
                          </td>
                          {isAdmin ? (
                            <>
                              <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                                {formatDuration(c.agentDurationSeconds)}
                              </td>
                              <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                                {formatDuration(c.customerDurationSeconds)}
                              </td>
                              <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                                {formatDuration(c.durationSeconds)}
                              </td>
                            </>
                          ) : (
                            <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                              {formatDuration(c.durationSeconds)}
                            </td>
                          )}
                          <td className="whitespace-nowrap px-2.5 py-1.5">
                            {c.recordingDownloadUrl ? (
                              <button
                                type="button"
                                onClick={() => downloadRecording(c.id, c.recordingDownloadUrl)}
                                disabled={downloadingId === c.id}
                                className="rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
                              >
                                {downloadingId === c.id ? "Downloading…" : "Download"}
                              </button>
                            ) : (
                              <span className="text-zinc-500">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {!callsLoading && !callsError && calls.length > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Showing {calls.length} of {pagination.total}{" "}
                {callsFilter === "conference" ? "conference calls" : "calls"}
                {callsFilter === "recording" ? " with a recording" : ""}
              </p>
              <PageNav
                page={pagination.page}
                totalPages={pagination.totalPages}
                hasPrev={pagination.hasPrev}
                hasNext={pagination.hasNext}
                disabled={callsLoading || refreshing}
                onPrev={() => {
                  if (!pagination.hasPrev || callsLoading || refreshing) return;
                  setPage(Math.max(1, page - 1));
                }}
                onNext={() => {
                  if (!pagination.hasNext || callsLoading || refreshing) return;
                  setPage(page + 1);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "leads" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Leads</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Leads this user created or updated in the selected range (Eastern dates).
              </p>
            </div>
            <PageNav
              page={leadsPagination.page}
              totalPages={leadsPagination.totalPages}
              hasPrev={leadsPagination.hasPrev}
              hasNext={leadsPagination.hasNext}
              disabled={leadsLoading}
              onPrev={() => {
                if (!leadsPagination.hasPrev || leadsLoading) return;
                setLeadsPage(Math.max(1, leadsPagination.page - 1));
              }}
              onNext={() => {
                if (!leadsPagination.hasNext || leadsLoading) return;
                setLeadsPage(leadsPagination.page + 1);
              }}
            />
          </div>

          {leadsError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {leadsError}
            </p>
          ) : null}

          {leadsLoading && allLeads.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading leads…</p>
          ) : allLeads.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              No leads created or updated by this user in this date range.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                    <th className="px-2.5 py-2">Name</th>
                    <th className="px-2.5 py-2">Phone</th>
                    <th className="px-2.5 py-2">Phase</th>
                    <th className="px-2.5 py-2">In range</th>
                    <th className="whitespace-nowrap px-2.5 py-2">Created</th>
                    <th className="whitespace-nowrap px-2.5 py-2">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40">
                      <td className="px-2.5 py-1.5 font-medium text-zinc-900 dark:text-zinc-100">
                        <button
                          type="button"
                          onClick={() => void openLeadSidebar(lead.id)}
                          disabled={loadingLeadId === lead.id}
                          className="text-left font-medium text-sky-700 hover:underline focus:underline focus:outline-none disabled:opacity-60 dark:text-sky-300"
                          title="View sale"
                        >
                          {loadingLeadId === lead.id
                            ? "Loading…"
                            : lead.fullName || `Lead #${lead.id}`}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                        {lead.phone || "—"}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-zinc-700 dark:text-zinc-200">
                        {lead.leadPhase || "—"}
                      </td>
                      <td className="px-2.5 py-1.5">
                        <span className="flex flex-wrap gap-1">
                          {lead.createdInRange ? (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                              Created
                            </span>
                          ) : null}
                          {lead.updatedInRange ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                              Updated
                            </span>
                          ) : null}
                          {!lead.createdInRange && !lead.updatedInRange ? (
                            <span className="text-zinc-400">—</span>
                          ) : null}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-zinc-700 dark:text-zinc-200">
                        <EtTimeWithTooltip value={lead.createdAt} />
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-zinc-700 dark:text-zinc-200">
                        <EtTimeWithTooltip value={lead.updatedAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!leadsLoading && !leadsError && allLeads.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Showing {leads.length} of {leadsPagination.total} leads (created or updated in range;
                up to {LEADS_FETCH_SIZE} each). Click a name to open the sale sidebar.
              </p>
              <PageNav
                page={leadsPagination.page}
                totalPages={leadsPagination.totalPages}
                hasPrev={leadsPagination.hasPrev}
                hasNext={leadsPagination.hasNext}
                disabled={leadsLoading}
                onPrev={() => {
                  if (!leadsPagination.hasPrev || leadsLoading) return;
                  setLeadsPage(Math.max(1, leadsPagination.page - 1));
                }}
                onNext={() => {
                  if (!leadsPagination.hasNext || leadsLoading) return;
                  setLeadsPage(leadsPagination.page + 1);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
        </>
      ) : null}

      {selectedLead ? (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onLeadUpdated={(updated) => {
            setSelectedLead((prev) =>
              prev?.id === updated.id ? { ...prev, ...updated } : prev,
            );
            setAllLeads((prev) =>
              prev.map((row) =>
                row.id === updated.id
                  ? annotateLeadForRange({ ...row, ...updated }, appliedFrom, appliedTo)
                  : row,
              ),
            );
          }}
          showFullPageLink
          canAssignLead={isAdmin}
          canEditChargeAmount={isAdmin}
          userRole={viewerRole}
          currentUserId={currentUserId}
        />
      ) : null}
    </div>
  );
}
