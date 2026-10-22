"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import UserNameLabel from "@/components/UserNameLabel";
import EtTimeWithTooltip from "@/components/EtTimeWithTooltip";
import { formatDuration } from "@/lib/formatDuration";
import {
  REPORT_EASTERN_TODAY_NOTICE,
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

  // Timeline
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState(null);

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

  // Leads
  const [leads, setLeads] = useState([]);
  const [leadsError, setLeadsError] = useState(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsPagination, setLeadsPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [leadsPage, setLeadsPage] = useState(1);

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
    if (typeof onUserIdChange === "function") {
      onUserIdChange(filteredUsers[0].id);
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
    setMetrics(null);
    setTimelineEvents([]);
    setCalls([]);
    setLeads([]);
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
          pageSize: "100",
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

        const activitiesPromise = isAdmin
          ? fetch(
              `/api/users/${user.id}/activities?${new URLSearchParams({
                page: "1",
                pageSize: "100",
                fromDate: fromDate || "",
                toDate: toDate || "",
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
          return at - bt;
        });

        setTimelineEvents(events);
      } catch (err) {
        if (err.name === "AbortError") return;
        setTimelineError(err.message || "Failed to load timeline");
        setTimelineEvents([]);
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
    async (signal, nextPage = 1, fromDate = appliedFrom, toDate = appliedTo) => {
      if (!user?.id) return;
      setLeadsLoading(true);
      setLeadsError(null);
      try {
        const qs = new URLSearchParams({
          agentId: String(user.id),
          page: String(nextPage),
          pageSize: "25",
        });
        if (fromDate && toDate) {
          qs.set("fromDate", fromDate);
          qs.set("toDate", toDate);
          qs.set("dateField", "created");
        }
        const res = await fetch(`/api/leads?${qs.toString()}`, {
          credentials: "include",
          signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load leads");
        setLeads(json.leads || []);
        if (json.pagination) {
          setLeadsPagination(json.pagination);
          setLeadsPage(json.pagination.page || nextPage);
          setOverviewLeadsTotal(json.pagination.total ?? 0);
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        setLeadsError(err.message || "Failed to load leads");
        setLeads([]);
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
        const leadsQs = new URLSearchParams({
          agentId: String(user.id),
          page: "1",
          pageSize: "1",
          fromDate,
          toDate,
          dateField: "created",
        });

        const attendancePromise = fetch(`/api/attendance?${attQs}`, {
          credentials: "include",
          signal,
        }).then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json?.error || "Failed to load attendance");
          return json;
        });

        const leadsPromise = fetch(`/api/leads?${leadsQs}`, {
          credentials: "include",
          signal,
        }).then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) return { total: null };
          return { total: json.pagination?.total ?? 0 };
        });

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

        const [att, leadsInfo, metricsInfo] = await Promise.all([
          attendancePromise,
          leadsPromise,
          metricsPromise,
        ]);
        setAttendance(att);
        setOverviewLeadsTotal(leadsInfo.total);
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
    loadTimeline(controller.signal);
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
    loadLeads(controller.signal, leadsPage, appliedFrom, appliedTo);
    return () => controller.abort();
  }, [activeTab, user?.id, leadsPage, appliedFrom, appliedTo, loadLeads]);

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
          <MetricStat label="Absent days" value={attendanceRangeStats.absent} />
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
            label="Leads created"
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
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Timeline</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Everything in order for the selected range
              {isAdmin
                ? ": login, calls, lead work, leave, and other activity. Click an activity for full detail."
                : " (calls)."}
            </p>
          </div>
          {timelineError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {timelineError}
            </p>
          ) : null}
          {timelineLoading && timelineEvents.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading timeline…</p>
          ) : timelineEvents.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              No events for this user in this date range.
            </p>
          ) : (
            <ol className="relative space-y-0 border-l-2 border-zinc-200 pl-4 dark:border-zinc-700">
              {timelineEvents.map((event) => {
                if (event.kind === "activity") {
                  const row = event.row;
                  const kind = timelineActivityKind(row.action);
                  const detailsFull = formatActivityDetails(
                    row.metadata,
                    row.entityType,
                    row.entityId,
                  );
                  const open = expandedActivityId === row.id;
                  const location = formatActivityLocation(row);
                  return (
                    <li key={event.id} className="relative pb-3">
                      <span
                        className="absolute -left-[1.35rem] top-3 h-2.5 w-2.5 rounded-full border-2 border-white bg-sky-500 dark:border-zinc-950"
                        aria-hidden
                      />
                      <button
                        type="button"
                        onClick={() => void toggleActivityRow(row.id)}
                        className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          open
                            ? "border-sky-300 bg-sky-50/80 dark:border-sky-700 dark:bg-sky-950/30"
                            : "border-zinc-200 bg-zinc-50/50 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950/40 dark:hover:bg-zinc-900/60"
                        }`}
                        aria-expanded={open}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-sm tabular-nums text-zinc-700 dark:text-zinc-200">
                            {formatReportWhenDual(row.createdAt) || "—"}
                          </p>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${kind.className}`}
                          >
                            <ActivityChevron open={open} />
                            {kind.label}
                          </span>
                        </div>
                        <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                          {activityActionLabel(row.action, row.metadata)}
                        </p>
                        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">
                          {truncateActivityText(detailsFull, 140)}
                          {location && location !== "—" ? (
                            <>
                              <span className="mx-1.5 text-zinc-400">·</span>
                              {location}
                            </>
                          ) : null}
                        </p>
                      </button>
                      {open ? (
                        <div className="mt-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50">
                          {activityDetailLoadingId === row.id ? (
                            <p className="text-xs text-zinc-600 dark:text-zinc-300">
                              Loading record…
                            </p>
                          ) : activityDetailError && !activityDetailCache[row.id] ? (
                            <p className="text-xs text-red-700 dark:text-red-300">
                              {activityDetailError}
                            </p>
                          ) : activityDetailCache[row.id] ? (
                            <ActivityRowDetail row={activityDetailCache[row.id]} />
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
                return (
                  <li key={event.id} className="relative pb-3">
                    <span
                      className="absolute -left-[1.35rem] top-3 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-zinc-950"
                      aria-hidden
                    />
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950/40">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm tabular-nums text-zinc-700 dark:text-zinc-200">
                          {formatReportWhenDual(call.createdAt) || "—"}
                        </p>
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                          Call
                        </span>
                      </div>
                      <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">
                        {call.toNumber || "—"}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">
                        {call.status || "—"}
                        <span className="mx-1.5 text-zinc-400">·</span>
                        {formatDuration(call.durationSeconds)}
                        {Number(call.dialerIndex) === 2 ? (
                          <>
                            <span className="mx-1.5 text-zinc-400">·</span>
                            Line 2
                          </>
                        ) : null}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {!timelineLoading && !timelineError && timelineEvents.length > 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Showing {timelineEvents.length} event
              {timelineEvents.length === 1 ? "" : "s"} in time order (up to 100 calls
              {isAdmin ? " + 100 activities" : ""})
            </p>
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
            leave={attendanceRangeStats.leave}
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
                <button
                  type="button"
                  onClick={() => {
                    if (!pagination.hasPrev || callsLoading || refreshing) return;
                    setPage(Math.max(1, page - 1));
                  }}
                  disabled={!pagination.hasPrev || callsLoading || refreshing}
                  className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Prev
                </button>
                <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
                  {pagination.page}/{pagination.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!pagination.hasNext || callsLoading || refreshing) return;
                    setPage(page + 1);
                  }}
                  disabled={!pagination.hasNext || callsLoading || refreshing}
                  className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Next
                </button>
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
            <p className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
              Showing {calls.length} of {pagination.total}{" "}
              {callsFilter === "conference" ? "conference calls" : "calls"}
              {callsFilter === "recording" ? " with a recording" : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {activeTab === "leads" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Leads</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Leads created by this user.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (!leadsPagination.hasPrev || leadsLoading) return;
                  setLeadsPage(Math.max(1, leadsPage - 1));
                }}
                disabled={!leadsPagination.hasPrev || leadsLoading}
                className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Prev
              </button>
              <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
                {leadsPagination.page}/{leadsPagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!leadsPagination.hasNext || leadsLoading) return;
                  setLeadsPage(leadsPage + 1);
                }}
                disabled={!leadsPagination.hasNext || leadsLoading}
                className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Next
              </button>
            </div>
          </div>

          {leadsError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {leadsError}
            </p>
          ) : null}

          {leadsLoading && leads.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading leads…</p>
          ) : leads.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              No leads created by this user in this date range.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                    <th className="px-2.5 py-2">Name</th>
                    <th className="px-2.5 py-2">Phone</th>
                    <th className="px-2.5 py-2">Phase</th>
                    <th className="whitespace-nowrap px-2.5 py-2">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40">
                      <td className="px-2.5 py-1.5 font-medium text-zinc-900 dark:text-zinc-100">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="text-sky-700 hover:underline dark:text-sky-300"
                        >
                          {lead.fullName || `Lead #${lead.id}`}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                        {lead.phone || "—"}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-zinc-700 dark:text-zinc-200">
                        {lead.leadPhase || "—"}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-zinc-700 dark:text-zinc-200">
                        {formatReportWhenDual(lead.updatedAt) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!leadsLoading && !leadsError && leads.length > 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Showing {leads.length} of {leadsPagination.total} leads
            </p>
          ) : null}
        </div>
      ) : null}
        </>
      ) : null}
    </div>
  );
}
