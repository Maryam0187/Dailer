"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { io as ioClient } from "socket.io-client";
import { formatDuration } from "@/lib/formatDuration";
import { stripHtml } from "@/lib/richText";
import { sortUsersForDisplay } from "@/lib/sortUsers";

function roleLabel(role) {
  if (role === "agent") return "Agent";
  if (role === "manager") return "Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "admin") return "Admin";
  if (role === "lead_monitor") return "Lead Monitor";
  return role;
}

function normalizePresence(value) {
  if (value === "online" || value === "away" || value === "offline") return value;
  return "offline";
}

function activityActionLabel(action) {
  if (action === "login_success") return "Login";
  if (action === "login_failed") return "Login failed";
  if (action === "logout") return "Logout";
  if (action === "lead_created") return "Lead created";
  if (action === "lead_updated") return "Lead updated";
  if (action === "lead_status_change") return "Lead status changed";
  if (action === "lead_note_edit") return "Lead notes edited";
  if (action === "lead_breakdown_edit") return "Lead breakdown edited";
  if (action === "lead_comment") return "Lead comment";
  if (action === "lead_assigned") return "Lead assigned";
  if (action === "after_shift_access_granted") return "After-shift access granted";
  if (action === "after_shift_access_revoked") return "After-shift access revoked";
  return String(action || "Unknown").replace(/_/g, " ");
}

function formatActivityDetails(metadata, entityType, entityId) {
  if (!metadata || typeof metadata !== "object") {
    if (entityType === "lead" && entityId) return `Lead #${entityId}`;
    return "—";
  }
  const parts = [];
  if (metadata.leadName) parts.push(stripHtml(metadata.leadName));
  if (metadata.previousStatus && metadata.newStatus) {
    parts.push(`${metadata.previousStatus} → ${metadata.newStatus}`);
  }
  if (metadata.assignedUserId != null) {
    parts.push(`assigned to user #${metadata.assignedUserId}`);
  }
  if (metadata.summary) parts.push(stripHtml(metadata.summary));
  if (metadata.reason) parts.push(String(metadata.reason).replace(/_/g, " "));
  if (metadata.username) parts.push(`user: ${metadata.username}`);
  if (parts.length === 0 && entityType === "lead" && entityId) {
    parts.push(`Lead #${entityId}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function truncateActivityText(text, maxLength = 64) {
  if (!text || text === "—") return text;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function formatActivityLocation(row) {
  if (row?.location) return row.location;
  const parts = [row?.city, row?.region, row?.country].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return "—";
}

function formatActivityLocationTitle(row) {
  const place = [row?.city, row?.region, row?.country].filter(Boolean).join(", ");
  const lat = row?.latitude != null ? Number(row.latitude) : null;
  const lng = row?.longitude != null ? Number(row.longitude) : null;
  const coords =
    Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : null;
  if (place && coords) return `${place} (${coords})`;
  if (place) return place;
  if (coords) return coords;
  return undefined;
}

function formatLastActive(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 0) return date.toLocaleString();
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return date.toLocaleString();
}

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-emerald-400/70 dark:focus:ring-emerald-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";
const compactFilterLabelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const compactFilterSelectClass =
  "h-9 min-w-[14rem] rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-emerald-400/70 dark:focus:ring-emerald-400/20";

function RoleBadge({ value }) {
  const styles = {
    admin: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200",
    lead_monitor: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-200",
    manager: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
    supervisor: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200",
    agent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
  };
  const palette =
    value === "admin" ||
    value === "lead_monitor" ||
    value === "manager" ||
    value === "supervisor" ||
    value === "agent"
      ? styles[value]
      : "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${palette}`}>
      {roleLabel(value)}
    </span>
  );
}

function ActiveBadge({ active }) {
  return active ? (
    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
      Active
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-600 dark:text-zinc-200">
      Inactive
    </span>
  );
}

const GRANT_DURATION_OPTIONS = [
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 480, label: "8 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "24 hours" },
];

function formatGrantExpiry(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function grantDurationLabel(minutes) {
  const opt = GRANT_DURATION_OPTIONS.find((o) => o.value === minutes);
  return opt?.label || `${minutes} min`;
}

function AfterShiftAccessBadge({ access, expiresAt, grantDurationMinutes }) {
  if (access === "full") {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
          Full
        </span>
        {expiresAt ? (
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">until {formatGrantExpiry(expiresAt)}</span>
        ) : grantDurationMinutes ? (
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{grantDurationLabel(grantDurationMinutes)} each grant</span>
        ) : null}
      </span>
    );
  }
  if (access === "limited") {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          Limited
        </span>
        {expiresAt ? (
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">until {formatGrantExpiry(expiresAt)}</span>
        ) : grantDurationMinutes ? (
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{grantDurationLabel(grantDurationMinutes)} each grant</span>
        ) : null}
      </span>
    );
  }
  return <span className="text-xs text-zinc-500 dark:text-zinc-400">
    {grantDurationMinutes ? `${grantDurationLabel(grantDurationMinutes)} when granted` : "—"}
  </span>;
}

function PresenceBadge({ status }) {
  const value = normalizePresence(status);
  const styles = {
    online: {
      dot: "bg-emerald-500",
      pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
      label: "Online",
    },
    away: {
      dot: "bg-amber-500",
      pill: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
      label: "Away",
    },
    offline: {
      dot: "bg-zinc-400",
      pill: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
      label: "Offline",
    },
  };
  const s = styles[value];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getPresetRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") {
    const d = formatDateInput(today);
    return { from: d, to: d };
  }
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const d = formatDateInput(y);
    return { from: d, to: d };
  }
  if (preset === "week") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: formatDateInput(from), to: formatDateInput(today) };
  }
  if (preset === "month") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: formatDateInput(from), to: formatDateInput(today) };
  }
  return { from: "", to: "" };
}

const callsDateInputClass =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-emerald-400/70 dark:focus:ring-emerald-400/20";

function UserCallLogCard({ call, isAdmin, showConferenceColumn, onDownload, downloadingId }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-950/40">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-zinc-700 dark:text-zinc-200">
          {new Date(call.createdAt).toLocaleString()}
        </p>
        <span className="shrink-0 rounded-full bg-zinc-200/80 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {call.status || "—"}
        </span>
      </div>
      <p className="mt-2 font-semibold text-zinc-900 dark:text-zinc-100">{call.toNumber || "—"}</p>
      {showConferenceColumn ? (
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
          Invited:{" "}
          {Array.isArray(call.invitedToNames) && call.invitedToNames.length > 0
            ? call.invitedToNames.join(", ")
            : "—"}
        </p>
      ) : null}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-zinc-700 dark:text-zinc-200">
        {isAdmin ? (
          <>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Agent leg</dt>
              <dd className="tabular-nums">{formatDuration(call.agentDurationSeconds)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Customer leg</dt>
              <dd className="tabular-nums">{formatDuration(call.customerDurationSeconds)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total</dt>
              <dd className="font-semibold tabular-nums">{formatDuration(call.durationSeconds)}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Duration</dt>
            <dd className="font-semibold tabular-nums">{formatDuration(call.durationSeconds)}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Recording</dt>
          <dd className="mt-0.5">
            {call.recordingDownloadUrl ? (
              <button
                type="button"
                onClick={() => onDownload(call.id, call.recordingDownloadUrl)}
                disabled={downloadingId === call.id}
                className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
              >
                {downloadingId === call.id ? "Downloading…" : "Download"}
              </button>
            ) : (
              <span className="text-zinc-500">—</span>
            )}
          </dd>
        </div>
      </dl>
    </article>
  );
}

const menuItemBase =
  "flex w-full items-center rounded-lg border px-3 py-1.5 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50";

const menuViewClass = `${menuItemBase} border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-950/60`;
const menuEditClass = `${menuItemBase} border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800`;
const menuDeactivateClass = `${menuItemBase} border-red-200 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60`;
const menuActivateClass = `${menuItemBase} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60`;

function UserRowActionsMenu({
  user,
  active,
  isSelf,
  busy,
  isAdmin,
  onView,
  onEdit,
  onActivate,
  onDeactivate,
  onGrantAfterShift,
  onRevokeAfterShift,
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 140;
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < menuHeight + gap && rect.top > menuHeight + gap;
    const top = openUpward ? rect.top - gap : rect.bottom + gap;

    setMenuPosition({
      top,
      left: rect.right,
      transform: openUpward ? "translate(-100%, -100%)" : "translateX(-100%)",
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();
    const raf = requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      const target = event.target;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function runAction(action) {
    setOpen(false);
    setMenuPosition(null);
    action();
  }

  const menuPanelClass =
    "fixed z-[100] flex min-w-[9.5rem] flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg ring-1 ring-zinc-950/5 dark:border-zinc-600 dark:bg-zinc-800 dark:ring-white/10";

  const menu =
    open && menuPosition ? (
      <div ref={menuRef} role="menu" className={menuPanelClass} style={menuPosition}>
        <button type="button" role="menuitem" className={menuViewClass} onClick={() => runAction(onView)}>
          View
        </button>
        <button type="button" role="menuitem" className={menuEditClass} onClick={() => runAction(onEdit)}>
          Edit
        </button>
        {!isSelf ? (
          active ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              className={menuDeactivateClass}
              onClick={() => runAction(onDeactivate)}
            >
              {busy ? "Deactivating…" : "Deactivate"}
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              className={menuActivateClass}
              onClick={() => runAction(onActivate)}
            >
              {busy ? "Activating…" : "Activate"}
            </button>
          )
        ) : null}
        {isAdmin && user.role !== "admin" && active ? (
          user.afterShiftAccess === "full" || user.afterShiftAccess === "limited" ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              className={menuDeactivateClass}
              onClick={() => runAction(onRevokeAfterShift)}
            >
              {busy ? "Revoking…" : "Revoke after-shift access"}
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              className={menuActivateClass}
              onClick={() => runAction(onGrantAfterShift)}
            >
              {busy ? "Granting…" : "Grant full after-shift access"}
            </button>
          )
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
            setMenuPosition(null);
            return;
          }
          const trigger = triggerRef.current;
          if (trigger) {
            const rect = trigger.getBoundingClientRect();
            const gap = 4;
            const menuHeight = 140;
            const spaceBelow = window.innerHeight - rect.bottom;
            const openUpward = spaceBelow < menuHeight + gap && rect.top > menuHeight + gap;
            const top = openUpward ? rect.top - gap : rect.bottom + gap;
            setMenuPosition({
              top,
              left: rect.right,
              transform: openUpward ? "translate(-100%, -100%)" : "translateX(-100%)",
            });
          }
          setOpen(true);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        aria-label={`Actions for ${user.username}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-5 w-5"
          aria-hidden
        >
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 4a2 2 0 110-4 2 2 0 010 4zm0 4a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </>
  );
}

function MetricStat({ label, value }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/50">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function UserDetailModal({ user, currentUserId, viewerRole, onClose }) {
  const isAdmin = viewerRole === "admin";
  const [activeTab, setActiveTab] = useState("calls");
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [calls, setCalls] = useState([]);
  const [callsError, setCallsError] = useState(null);
  const [callsLoading, setCallsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsScope, setMetricsScope] = useState("all");
  const [activities, setActivities] = useState([]);
  const [activitiesError, setActivitiesError] = useState(null);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const [activityPagination, setActivityPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [page, setPage] = useState(1);
  const [callsFilter, setCallsFilter] = useState("all");
  const [rangePreset, setRangePreset] = useState("today");
  const initialRange = getPresetRange("today");
  const [rangeFrom, setRangeFrom] = useState(initialRange.from);
  const [rangeTo, setRangeTo] = useState(initialRange.to);
  const [appliedFrom, setAppliedFrom] = useState(initialRange.from);
  const [appliedTo, setAppliedTo] = useState(initialRange.to);
  const [downloadingId, setDownloadingId] = useState(null);

  const loadDetail = useCallback(async (signal) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        credentials: "include",
        signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load user");
      setDetail(json.user);
    } catch (err) {
      if (err.name === "AbortError") return;
      setDetailError(err.message || "Failed to load user");
    } finally {
      setDetailLoading(false);
    }
  }, [user.id]);

  const loadCalls = useCallback(
    async (
      signal,
      nextPage = 1,
      filter = callsFilter,
      fromDate = appliedFrom,
      toDate = appliedTo,
      { silent = false } = {},
    ) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setCallsLoading(true);
      }
      setCallsError(null);
      try {
        const qs = new URLSearchParams({
          page: String(nextPage),
          pageSize: "10",
        });
        if (fromDate && toDate) {
          qs.set("fromDate", fromDate);
          qs.set("toDate", toDate);
        }
        if (filter === "recording") {
          qs.set("hasRecording", "true");
        }
        if (filter === "conference") {
          qs.set("scope", "conference");
        }
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
        if (silent) {
          setRefreshing(false);
        } else {
          setCallsLoading(false);
        }
      }
    },
    [user.id, callsFilter, appliedFrom, appliedTo],
  );

  const loadMetrics = useCallback(
    async (signal, fromDate = appliedFrom, toDate = appliedTo, scope = metricsScope) => {
      if (!isAdmin) return;
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
    [user.id, isAdmin, appliedFrom, appliedTo, metricsScope],
  );

  const loadActivities = useCallback(
    async (signal, nextPage = 1, fromDate = appliedFrom, toDate = appliedTo) => {
      if (!isAdmin) return;
      setActivitiesLoading(true);
      setActivitiesError(null);
      try {
        const qs = new URLSearchParams({
          page: String(nextPage),
          pageSize: "20",
          fromDate,
          toDate,
        });
        const res = await fetch(`/api/users/${user.id}/activities?${qs.toString()}`, {
          credentials: "include",
          signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load activity");
        setActivities(json.activities || []);
        if (json.pagination) {
          setActivityPagination(json.pagination);
          setActivityPage(json.pagination.page || nextPage);
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        setActivitiesError(err.message || "Failed to load activity");
        setActivities([]);
      } finally {
        setActivitiesLoading(false);
      }
    },
    [user.id, isAdmin, appliedFrom, appliedTo],
  );

  async function onRefresh() {
    const controller = new AbortController();
    await loadCalls(controller.signal, page, callsFilter, appliedFrom, appliedTo, {
      silent: calls.length > 0,
    });
  }

  useEffect(() => {
    setActiveTab("calls");
    setCallsFilter("all");
    setMetricsScope("all");
    setRangePreset("today");
    const next = getPresetRange("today");
    setRangeFrom(next.from);
    setRangeTo(next.to);
    setAppliedFrom(next.from);
    setAppliedTo(next.to);
    setPage(1);
    setActivityPage(1);
    setMetrics(null);
    setActivities([]);
    const controller = new AbortController();
    loadDetail(controller.signal);
    return () => controller.abort();
  }, [user.id, loadDetail]);

  useEffect(() => {
    if (activeTab !== "calls") return undefined;
    const controller = new AbortController();
    loadCalls(controller.signal, page, callsFilter, appliedFrom, appliedTo);
    return () => controller.abort();
  }, [user.id, callsFilter, appliedFrom, appliedTo, page, loadCalls, activeTab]);

  useEffect(() => {
    if (!isAdmin || activeTab !== "metrics") return undefined;
    const controller = new AbortController();
    loadMetrics(controller.signal, appliedFrom, appliedTo, metricsScope);
    return () => controller.abort();
  }, [user.id, isAdmin, activeTab, appliedFrom, appliedTo, metricsScope, loadMetrics]);

  useEffect(() => {
    if (!isAdmin || activeTab !== "activity") return undefined;
    const controller = new AbortController();
    loadActivities(controller.signal, activityPage, appliedFrom, appliedTo);
    return () => controller.abort();
  }, [user.id, isAdmin, activeTab, activityPage, appliedFrom, appliedTo, loadActivities]);

  function applyPreset(preset) {
    setRangePreset(preset);
    if (preset === "custom") return;
    const next = getPresetRange(preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
    setAppliedFrom(next.from);
    setAppliedTo(next.to);
    setPage(1);
    setActivityPage(1);
  }

  async function onApplyRange() {
    if (rangePreset !== "custom") return;
    if (!rangeFrom || !rangeTo) {
      setCallsError("From date and to date are required");
      return;
    }
    if (rangeFrom > rangeTo) {
      setCallsError("From date must be on or before to date");
      return;
    }
    setCallsError(null);
    setAppliedFrom(rangeFrom);
    setAppliedTo(rangeTo);
    setPage(1);
    setActivityPage(1);
  }

  async function onPrev() {
    if (!pagination.hasPrev || callsLoading) return;
    const nextPage = Math.max(1, page - 1);
    setPage(nextPage);
  }
  async function onNext() {
    if (!pagination.hasNext || callsLoading) return;
    setPage(page + 1);
  }

  function onActivityPrev() {
    if (!activityPagination.hasPrev || activitiesLoading) return;
    setActivityPage(Math.max(1, activityPage - 1));
  }

  function onActivityNext() {
    if (!activityPagination.hasNext || activitiesLoading) return;
    setActivityPage(activityPage + 1);
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

  const presence = normalizePresence(user.presence ?? detail?.presence);
  const lastActiveAt = detail?.lastActiveAt ?? user.lastActiveAt ?? null;
  const createdByLabel =
    detail?.createdByUsername ??
    user.createdByUsername ??
    (detail?.createdBy ?? user.createdBy ? `User #${detail?.createdBy ?? user.createdBy}` : "—");
  const createdAtValue = detail?.createdAt ?? user.createdAt ?? null;
  const isSelf = user.id === currentUserId;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/60 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-detail-title"
        className="relative z-10 flex max-h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="border-b border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-700">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="user-detail-title"
                className="text-lg font-semibold text-zinc-950 dark:text-zinc-50"
              >
                {user.username}
                {isSelf ? (
                  <span className="ml-2 text-xs font-normal text-zinc-500">(you)</span>
                ) : null}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <RoleBadge value={user.role} />
                <PresenceBadge status={presence} />
                <ActiveBadge active={user.isActive !== false} />
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Last active:{" "}
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {detailLoading && !detail ? "Loading…" : formatLastActive(lastActiveAt)}
                </span>
                {lastActiveAt ? (
                  <span className="ml-1.5 text-xs text-zinc-500">
                    ({new Date(lastActiveAt).toLocaleString()})
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Created by:{" "}
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {detailLoading && !detail ? "Loading…" : createdByLabel}
                </span>
                <span className="mx-1.5 text-zinc-400 dark:text-zinc-500">·</span>
                Created:{" "}
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {detailLoading && !detail
                    ? "Loading…"
                    : createdAtValue
                      ? new Date(createdAtValue).toLocaleString()
                      : "—"}
                </span>
              </p>
              {detailError ? (
                <p className="mt-2 text-xs text-red-600">{detailError}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
          <div className="mb-4 flex overflow-x-auto border-b border-zinc-200 dark:border-zinc-700 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setActiveTab("calls")}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition-colors sm:px-4 ${
                activeTab === "calls"
                  ? "border-emerald-600 text-emerald-800 dark:border-emerald-500 dark:text-emerald-200"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Call logs
            </button>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setActiveTab("metrics")}
                className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition-colors sm:px-4 ${
                  activeTab === "metrics"
                    ? "border-violet-600 text-violet-800 dark:border-violet-500 dark:text-violet-200"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                Metrics
              </button>
            ) : null}
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setActiveTab("activity")}
                className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition-colors sm:px-4 ${
                  activeTab === "activity"
                    ? "border-sky-600 text-sky-800 dark:border-sky-500 dark:text-sky-200"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                Activity
              </button>
            ) : null}
          </div>

          <div className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
            <div className="mb-3">
              <label className={labelClass}>Range presets</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "today", label: "Today" },
                  { id: "yesterday", label: "Yesterday" },
                  { id: "week", label: "Week" },
                  { id: "month", label: "Month" },
                  { id: "custom", label: "Custom" },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      rangePreset === p.id
                        ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="user-detail-from-date" className={labelClass}>
                  From date
                </label>
                <input
                  id="user-detail-from-date"
                  type="date"
                  className={callsDateInputClass}
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
                <label htmlFor="user-detail-to-date" className={labelClass}>
                  To date
                </label>
                <input
                  id="user-detail-to-date"
                  type="date"
                  className={callsDateInputClass}
                  value={rangeTo}
                  disabled={rangePreset !== "custom"}
                  onChange={(e) => {
                    setRangePreset("custom");
                    setRangeTo(e.target.value);
                  }}
                  required
                />
              </div>
              <div className="flex items-end sm:col-span-1">
                <button
                  type="button"
                  onClick={onApplyRange}
                  disabled={
                    callsLoading || metricsLoading || activitiesLoading || rangePreset !== "custom"
                  }
                  className="h-10 w-full rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
                >
                  Apply range
                </button>
              </div>
            </div>
          </div>

          {activeTab === "activity" && isAdmin ? (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  User activity
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Login, logout, and other tracked actions for this user in the selected date range.
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onActivityPrev}
                  disabled={!activityPagination.hasPrev || activitiesLoading}
                  className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Prev
                </button>
                <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
                  Page {activityPagination.page} / {activityPagination.totalPages}
                </span>
                <button
                  type="button"
                  onClick={onActivityNext}
                  disabled={!activityPagination.hasNext || activitiesLoading}
                  className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Next
                </button>
              </div>

              {activitiesError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                  {activitiesError}
                </p>
              ) : null}

              {activitiesLoading && activities.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading activity…</p>
              ) : activities.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  No activity for this user in this date range.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
                  <table className="w-full min-w-[32rem] table-fixed text-left text-sm">
                    <colgroup>
                      <col className="w-[10.5rem]" />
                      <col className="w-[8.5rem]" />
                      <col className="w-[13rem]" />
                      <col className="w-[11rem]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                        <th className="whitespace-nowrap px-3 py-2.5">When</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Action</th>
                        <th className="w-[13rem] max-w-[13rem] px-3 py-2.5">Details</th>
                        <th className="w-[11rem] max-w-[11rem] px-3 py-2.5">Location</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {activities.map((row) => {
                        const detailsFull = formatActivityDetails(
                          row.metadata,
                          row.entityType,
                          row.entityId,
                        );
                        const details = truncateActivityText(detailsFull);
                        const location = formatActivityLocation(row);
                        return (
                          <tr key={row.id}>
                            <td className="whitespace-nowrap px-3 py-2.5 text-zinc-700 dark:text-zinc-200">
                              {new Date(row.createdAt).toLocaleString()}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                              {activityActionLabel(row.action)}
                            </td>
                            <td className="w-[13rem] max-w-[13rem] overflow-hidden px-3 py-2.5">
                              <p
                                className="truncate text-zinc-700 dark:text-zinc-200"
                                title={detailsFull !== "—" ? detailsFull : undefined}
                              >
                                {details}
                              </p>
                            </td>
                            <td className="w-[11rem] max-w-[11rem] overflow-hidden px-3 py-2.5">
                              <p
                                className="truncate text-zinc-700 dark:text-zinc-200"
                                title={formatActivityLocationTitle(row)}
                              >
                                {location}
                              </p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!activitiesLoading && !activitiesError && activities.length > 0 ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Showing {activities.length} of {activityPagination.total} activity entries
                </p>
              ) : null}
            </div>
          ) : activeTab === "metrics" && isAdmin ? (
            <div className="flex flex-col gap-4">
              <div>
                <label className={labelClass}>Call scope</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setMetricsScope("all")}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      metricsScope === "all"
                        ? "border-violet-600 bg-violet-100 text-violet-950 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    All calls
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetricsScope("conference")}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      metricsScope === "conference"
                        ? "border-violet-600 bg-violet-100 text-violet-950 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    Conference calls
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
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
                  <MetricStat
                    label="Total duration"
                    value={formatDuration(metrics?.durationSeconds)}
                  />
                </div>
              )}
            </div>
          ) : (
          <>
          <div className="mb-4 flex flex-col gap-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {callsFilter === "conference" ? "Conference call logs" : "Recent call logs"}
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCallsFilter("all");
                    setPage(1);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    callsFilter === "all"
                      ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  All calls
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCallsFilter("recording");
                    setPage(1);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    callsFilter === "recording"
                      ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  With recording
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCallsFilter("conference");
                    setPage(1);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    callsFilter === "conference"
                      ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  Conference calls
                </button>
              </div>
              {callsFilter === "conference" ? (
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Calls where another agent was invited via “Add agent”, or where this user was
                  invited to a conference.
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onPrev}
                disabled={!pagination.hasPrev || callsLoading || refreshing}
                className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Prev
              </button>
              <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
                Page {pagination.page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={onNext}
                disabled={!pagination.hasNext || callsLoading || refreshing}
                className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Next
              </button>
              <button
                type="button"
                onClick={onRefresh}
                disabled={callsLoading || refreshing}
                className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          {callsError ? (
            <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
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
                  : "No call logs for this user in this date range."}
            </p>
          ) : (
            <>
            <div className="space-y-3 md:hidden">
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
            <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 md:block dark:border-zinc-700">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                    <th className="whitespace-nowrap px-3 py-2.5">When</th>
                    {callsFilter === "conference" ? (
                      <th className="px-3 py-2.5">Invited</th>
                    ) : null}
                    <th className="px-3 py-2.5">To</th>
                    <th className="px-3 py-2.5">Status</th>
                    {isAdmin ? (
                      <>
                        <th className="whitespace-nowrap px-3 py-2.5">Agent leg</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Customer leg</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Total</th>
                      </>
                    ) : (
                      <th className="whitespace-nowrap px-3 py-2.5">Duration</th>
                    )}
                    <th className="whitespace-nowrap px-3 py-2.5">Recording</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {calls.map((c) => (
                    <tr key={c.id}>
                      <td className="whitespace-nowrap px-3 py-2.5 text-zinc-700 dark:text-zinc-200">
                        {new Date(c.createdAt).toLocaleString()}
                      </td>
                      {callsFilter === "conference" ? (
                        <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-200">
                          {Array.isArray(c.invitedToNames) && c.invitedToNames.length > 0
                            ? c.invitedToNames.join(", ")
                            : "—"}
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                        {c.toNumber || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-200">
                        {c.status || "—"}
                      </td>
                      {isAdmin ? (
                        <>
                          <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                            {formatDuration(c.agentDurationSeconds)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                            {formatDuration(c.customerDurationSeconds)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                            {formatDuration(c.durationSeconds)}
                          </td>
                        </>
                      ) : (
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                          {formatDuration(c.durationSeconds)}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {c.recordingDownloadUrl ? (
                          <button
                            type="button"
                            onClick={() => downloadRecording(c.id, c.recordingDownloadUrl)}
                            disabled={downloadingId === c.id}
                            className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
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
            </>
          )}

          {!callsLoading && !callsError && calls.length > 0 ? (
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Showing {calls.length} of {pagination.total}{" "}
              {callsFilter === "conference" ? "conference calls" : "calls"}
              {callsFilter === "recording" ? " with a recording" : ""}
            </p>
          ) : null}
          </>
          )}
        </div>
      </div>
    </div>
  );
}

function EditUserModal({
  user,
  onClose,
  role: viewerRole,
  managers,
  supervisors,
  currentUserId,
  onSaved,
}) {
  const isAdmin = viewerRole === "admin";
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState("");
  const [editRole, setEditRole] = useState(user.role);
  const [managerId, setManagerId] = useState(user.managerId ?? "");
  const [supervisorId, setSupervisorId] = useState(user.supervisorId ?? "");
  const [isActive, setIsActive] = useState(user.isActive !== false);
  const [afterShiftAccess, setAfterShiftAccess] = useState(user.afterShiftAccess || "none");
  const [grantDurationMinutes, setGrantDurationMinutes] = useState(
    user.afterShiftGrantDurationMinutes ?? 120,
  );
  const [limitedFileId, setLimitedFileId] = useState(
    user.afterShiftLimitedFileId != null ? String(user.afterShiftLimitedFileId) : "",
  );
  const [fileOptions, setFileOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setUsername(user.username);
    setPassword("");
    setEditRole(user.role);
    setManagerId(user.managerId ?? "");
    setSupervisorId(user.supervisorId ?? "");
    setIsActive(user.isActive !== false);
    setAfterShiftAccess(user.afterShiftAccess || "none");
    setGrantDurationMinutes(user.afterShiftGrantDurationMinutes ?? 120);
    setLimitedFileId(user.afterShiftLimitedFileId != null ? String(user.afterShiftLimitedFileId) : "");
    setError(null);
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/shift/settings", { credentials: "include", cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          const globalDefault = json.settings?.afterShiftGrantDurationMinutes || 120;
          setGrantDurationMinutes(user.afterShiftGrantDurationMinutes ?? globalDefault);
        }
      } catch {
        /* use default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, user.afterShiftGrantDurationMinutes]);

  useEffect(() => {
    if (!isAdmin || !user?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/files?userId=${user.id}&pageSize=200`, { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load files");
        if (!cancelled) setFileOptions(json.files || []);
      } catch {
        if (!cancelled) setFileOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, user.id]);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {};
      if (username.trim() !== user.username) payload.username = username.trim();
      if (password.trim()) payload.password = password.trim();

      if (isAdmin) {
        if (editRole !== user.role) {
          payload.role = editRole;
          if (editRole === "agent") {
            payload.managerId = managerId === "" || managerId == null ? null : Number(managerId);
            payload.supervisorId =
              supervisorId === "" || supervisorId == null ? null : Number(supervisorId);
          } else if (editRole === "supervisor") {
            payload.managerId = managerId === "" || managerId == null ? null : Number(managerId);
          }
        } else if (editRole === "agent") {
          const mid = managerId === "" || managerId == null ? null : Number(managerId);
          const prev = user.managerId != null ? Number(user.managerId) : null;
          if (mid !== prev) {
            payload.managerId = mid;
          }
          const sid = supervisorId === "" || supervisorId == null ? null : Number(supervisorId);
          const prevSid = user.supervisorId != null ? Number(user.supervisorId) : null;
          if (sid !== prevSid) payload.supervisorId = sid;
        } else if (editRole === "supervisor") {
          const mid = managerId === "" || managerId == null ? null : Number(managerId);
          const prev = user.managerId != null ? Number(user.managerId) : null;
          if (mid !== prev) payload.managerId = mid;
        }
      }

      if (isActive !== (user.isActive !== false)) payload.isActive = isActive;

      if (isAdmin && user.role !== "admin") {
        const prevAccess = user.afterShiftAccess || "none";
        if (afterShiftAccess !== prevAccess) payload.afterShiftAccess = afterShiftAccess;
        if (afterShiftAccess === "limited") {
          payload.afterShiftLimitedFileId = limitedFileId ? Number(limitedFileId) : null;
        } else if (prevAccess === "limited") {
          payload.afterShiftLimitedFileId = null;
        }
        if (user.afterShiftGrantDurationMinutes !== grantDurationMinutes) {
          payload.afterShiftGrantDurationMinutes = grantDurationMinutes;
        }
        if (afterShiftAccess === "full" || afterShiftAccess === "limited") {
          if (afterShiftAccess !== prevAccess) {
            payload.afterShiftAccessDurationMinutes = grantDurationMinutes;
          }
        }
      }

      if (isAdmin && afterShiftAccess === "limited" && !limitedFileId) {
        throw new Error("Select a file for limited after-shift access.");
      }

      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Update failed");

      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message || "Update failed");
    } finally {
      setLoading(false);
    }
  }

  const showManager = isAdmin && (editRole === "agent" || editRole === "supervisor");
  const showSupervisor = isAdmin && editRole === "agent";
  const filteredSupervisors =
    managerId == null || managerId === ""
      ? supervisors
      : supervisors.filter((s) => Number(s.managerId) === Number(managerId));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/60 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-user-title"
        className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2 id="edit-user-title" className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Edit user
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{user.username}</p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="edit-username" className={labelClass}>
              Username
            </label>
            <input
              id="edit-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="edit-password" className={labelClass}>
              New password <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              id="edit-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="Leave blank to keep current"
              autoComplete="new-password"
            />
          </div>

          {isAdmin ? (
            <>
              <div>
                <label htmlFor="edit-role" className={labelClass}>
                  Role
                </label>
                <select
                  id="edit-role"
                  className={inputClass}
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                >
                  <option value="agent">Agent</option>
                  <option value="manager">Manager</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="lead_monitor">Lead Monitor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {showManager ? (
                <div>
                  <label htmlFor="edit-manager" className={labelClass}>
                    Manager (optional)
                  </label>
                  <select
                    id="edit-manager"
                    className={inputClass}
                    value={managerId === null || managerId === undefined ? "" : String(managerId)}
                    onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">No manager</option>
                    {managers.length === 0 ? (
                      <option value="">No managers</option>
                    ) : null}
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.username}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {showSupervisor ? (
                <div>
                  <label htmlFor="edit-supervisor" className={labelClass}>
                    Supervisor (optional)
                  </label>
                  <select
                    id="edit-supervisor"
                    className={inputClass}
                    value={supervisorId === null || supervisorId === undefined ? "" : String(supervisorId)}
                    onChange={(e) => setSupervisorId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">No supervisor</option>
                    {supervisors.length === 0 ? (
                      <option value="">No supervisors available</option>
                    ) : null}
                    {filteredSupervisors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.username}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-600 dark:bg-zinc-800/50">
            <input
              id="edit-active"
              type="checkbox"
              checked={isActive}
              disabled={user.id === currentUserId}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="edit-active" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Account active
              {user.id === currentUserId ? (
                <span className="ml-1 font-normal text-zinc-500">(cannot deactivate yourself)</span>
              ) : null}
            </label>
          </div>

          {isAdmin && user.role !== "admin" ? (
            <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-800 dark:bg-sky-950/30">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">After-shift access</p>
              <div className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="after-shift-access"
                    checked={afterShiftAccess === "none"}
                    onChange={() => setAfterShiftAccess("none")}
                  />
                  None
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="after-shift-access"
                    checked={afterShiftAccess === "full"}
                    onChange={() => setAfterShiftAccess("full")}
                  />
                  Full access
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="after-shift-access"
                    checked={afterShiftAccess === "limited"}
                    onChange={() => setAfterShiftAccess("limited")}
                  />
                  Limited (dialer + one file)
                </label>
              </div>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                After-shift grant duration (this user)
                <select
                  className={`${inputClass} mt-1.5`}
                  value={grantDurationMinutes}
                  onChange={(e) => setGrantDurationMinutes(Number(e.target.value))}
                >
                  {GRANT_DURATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  Used when granting full or limited after-shift access. Overrides the global shift default.
                </span>
                {user.afterShiftAccessExpiresAt &&
                (user.afterShiftAccess === "full" || user.afterShiftAccess === "limited") ? (
                  <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
                    Current grant expires {formatGrantExpiry(user.afterShiftAccessExpiresAt)}
                  </span>
                ) : null}
              </label>
              {afterShiftAccess === "limited" ? (
                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Assigned file
                  <select
                    className={`${inputClass} mt-1.5`}
                    value={limitedFileId}
                    onChange={(e) => setLimitedFileId(e.target.value)}
                  >
                    <option value="">Select a file…</option>
                    {fileOptions.length === 0 ? (
                      <option value="" disabled>
                        No files for this user
                      </option>
                    ) : null}
                    {fileOptions.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function normalizeUsersList(list) {
  return (list || []).map((u) => ({
    ...u,
    isActive: u.isActive !== false && u.isActive !== 0,
    afterShiftAccess: u.afterShiftAccess || "none",
    afterShiftLimitedFileId: u.afterShiftLimitedFileId ?? null,
    afterShiftAccessExpiresAt: u.afterShiftAccessExpiresAt ?? null,
    afterShiftGrantDurationMinutes: u.afterShiftGrantDurationMinutes ?? null,
    presence: normalizePresence(u.presence),
    lastActiveAt: u.lastActiveAt ?? null,
  }));
}

export default function UsersClient({ role, managers, supervisors, initialUsers, currentUserId }) {
  const [users, setUsers] = useState(() => normalizeUsersList(initialUsers));
  const [defaultGrantDurationMinutes, setDefaultGrantDurationMinutes] = useState(120);
  const applyPresenceUpdateRef = useRef(null);
  const [managerOptions, setManagerOptions] = useState(managers ?? []);
  const [supervisorOptions, setSupervisorOptions] = useState(supervisors ?? []);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [createRole, setCreateRole] = useState(role === "admin" ? "agent" : "agent");
  const [managerId, setManagerId] = useState(managers[0]?.id ?? null);
  const [supervisorId, setSupervisorId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [editingUser, setEditingUser] = useState(null);
  const [viewingUser, setViewingUser] = useState(null);
  const [rowBusyId, setRowBusyId] = useState(null);
  const [listError, setListError] = useState(null);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [listSupervisorFilter, setListSupervisorFilter] = useState("");

  const displayUsers = useMemo(() => {
    const sortedUsers = sortUsersForDisplay(users);
    if (role !== "admin" || !listSupervisorFilter) return sortedUsers;

    const supervisorId = Number(listSupervisorFilter);
    return sortedUsers.filter(
      (u) => u.role === "agent" && Number(u.supervisorId) === supervisorId,
    );
  }, [users, role, listSupervisorFilter]);

  const applyUsersList = useCallback(
    (list) => {
      const normalizedUsers = normalizeUsersList(list);
      setUsers(normalizedUsers);
      if (role === "admin") {
        const nextManagers = normalizedUsers
          .filter((u) => u.role === "manager" && u.isActive)
          .map((u) => ({ id: u.id, username: u.username }))
          .sort((a, b) => a.username.localeCompare(b.username));
        setManagerOptions(nextManagers);
        const nextSupervisors = normalizedUsers
          .filter((u) => u.role === "supervisor" && u.isActive)
          .map((u) => ({ id: u.id, username: u.username, managerId: u.managerId }))
          .sort((a, b) => a.username.localeCompare(b.username));
        setSupervisorOptions(nextSupervisors);
      } else if (role === "manager") {
        const nextSupervisors = normalizedUsers
          .filter((u) => u.role === "supervisor" && u.isActive)
          .map((u) => ({ id: u.id, username: u.username, managerId: u.managerId }))
          .sort((a, b) => a.username.localeCompare(b.username));
        setSupervisorOptions(nextSupervisors);
      }
    },
    [role],
  );

  async function loadUsers() {
    const res = await fetch("/api/users", { credentials: "include" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Failed to load users");
    applyUsersList(json.users || []);
  }

  const applyPresenceUpdate = useCallback((payload) => {
    const userId = Number(payload?.userId);
    if (!Number.isInteger(userId) || userId <= 0) return;
    const nextPresence = normalizePresence(payload?.presence);
    const lastActiveAt = payload?.lastActiveAt ?? null;
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, presence: nextPresence, lastActiveAt } : u)),
    );
  }, []);

  applyPresenceUpdateRef.current = applyPresenceUpdate;

  useEffect(() => {
    const socket = ioClient({
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socket.on("presence:update", (payload) => {
      applyPresenceUpdateRef.current?.(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (role !== "admin") return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/shift/settings", { credentials: "include", cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setDefaultGrantDurationMinutes(json.settings?.afterShiftGrantDurationMinutes || 120);
        }
      } catch {
        /* use default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  async function onRefreshUsers() {
    setListError(null);
    setListRefreshing(true);
    try {
      await loadUsers();
    } catch (err) {
      setListError(err.message || "Failed to refresh users");
    } finally {
      setListRefreshing(false);
    }
  }

  useEffect(() => {
    if (createRole !== "agent" && createRole !== "supervisor") return;
    const hasSelectedManager = managerOptions.some((m) => m.id === managerId);
    if (managerId != null && !hasSelectedManager) {
      setManagerId(null);
    }
  }, [managerOptions, createRole, managerId]);

  useEffect(() => {
    if (createRole !== "agent") {
      setSupervisorId(null);
      return;
    }
    const hasSelectedSupervisor = supervisorOptions.some(
      (s) => s.id === supervisorId && (!managerId || Number(s.managerId) === Number(managerId)),
    );
    if (supervisorId != null && !hasSelectedSupervisor) setSupervisorId(null);
  }, [createRole, managerId, supervisorId, supervisorOptions]);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        username,
        password,
      };
      if (role === "admin") {
        payload.role = createRole;
        if (createRole === "agent") payload.managerId = managerId;
        if (createRole === "agent") payload.supervisorId = supervisorId ?? null;
        if (createRole === "supervisor") payload.managerId = managerId ?? null;
      } else if (role === "manager") {
        payload.role = createRole;
        if (createRole === "agent" && supervisorId != null) {
          payload.supervisorId = supervisorId;
        }
      }

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to create user");

      setUsername("");
      setPassword("");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(u, nextActive) {
    if (u.id === currentUserId && !nextActive) return;
    setListError(null);
    setRowBusyId(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: nextActive }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Update failed");
      await loadUsers();
    } catch (err) {
      setListError(err.message || "Update failed");
    } finally {
      setRowBusyId(null);
    }
  }

  async function setAfterShiftAccessForUser(u, access, limitedFileId = null) {
    if (u.role === "admin") return;
    setListError(null);
    setRowBusyId(u.id);
    try {
      const duration = u.afterShiftGrantDurationMinutes ?? defaultGrantDurationMinutes;
      const body = { afterShiftAccess: access, afterShiftAccessDurationMinutes: duration };
      if (access === "limited") {
        if (!limitedFileId) {
          setEditingUser(u);
          return;
        }
        body.afterShiftLimitedFileId = limitedFileId;
      }
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Update failed");
      await loadUsers();
    } catch (err) {
      setListError(err.message || "Update failed");
    } finally {
      setRowBusyId(null);
    }
  }

  const isManager = role === "manager";
  const isSupervisor = role === "supervisor";
  const showRoleSelector = role === "admin" || isManager;
  const showManagerSelector =
    role === "admin" && (createRole === "agent" || createRole === "supervisor");
  const showSupervisorSelector = role === "admin" && createRole === "agent";
  const listHeading =
    role === "admin" ? "All users" : isManager ? "Your team" : "Your agents";
  const listDescription =
    role === "admin"
      ? "Everyone in the system."
      : isManager
        ? "Agents and supervisors assigned to you."
        : "Agents assigned to you as their supervisor.";
  const showHierarchyColumns = !isSupervisor;
  const showAfterShiftColumn = role === "admin";
  const filteredSupervisorOptions =
    managerId == null || managerId === ""
      ? supervisorOptions
      : supervisorOptions.filter((s) => Number(s.managerId) === Number(managerId));
  const visibleUsersCount = displayUsers.length;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      {editingUser ? (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          role={role}
          managers={managerOptions}
          supervisors={supervisorOptions}
          currentUserId={currentUserId}
          onSaved={loadUsers}
        />
      ) : null}

      {viewingUser ? (
        <UserDetailModal
          user={users.find((u) => u.id === viewingUser.id) ?? viewingUser}
          currentUserId={currentUserId}
          viewerRole={role}
          onClose={() => setViewingUser(null)}
        />
      ) : null}

      <section className="relative overflow-hidden rounded-2xl border-2 border-emerald-200/80 bg-gradient-to-br from-white via-zinc-50/60 to-emerald-50/35 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/10 dark:border-emerald-900/45 dark:from-zinc-900 dark:via-zinc-900 dark:to-emerald-950/25 dark:shadow-emerald-950/20 dark:ring-emerald-500/5">
        <div
          className="pointer-events-none absolute -right-8 -top-12 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl dark:bg-emerald-500/5"
          aria-hidden
        />
        <div className="relative border-l-4 border-l-emerald-500 p-6 sm:pl-7 sm:pr-8 sm:pt-8 sm:pb-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/25">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-6 w-6"
                  aria-hidden
                >
                  <path d="M6.25 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM3.25 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM19.75 7.5a.75.75 0 00-1.5 0v2.25H16a.75.75 0 000 1.5h2.25v2.25a.75.75 0 001.5 0v-2.25H22a.75.75 0 000-1.5h-2.25V7.5z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-2xl">
                  <span className="text-emerald-600 dark:text-emerald-400">Add a user</span>
                </h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Create an account with a username and password.
                  {role === "admin"
                    ? " Choose a role and, for agents or supervisors, optionally assign a manager."
                    : isManager
                      ? " Create an agent or supervisor under your team."
                      : " New accounts are created as your agents."}
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="new-user-username" className={labelClass}>
                  Username
                </label>
                <input
                  id="new-user-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. jsmith"
                  autoComplete="new-username"
                />
              </div>

              <div>
                <label htmlFor="new-user-password" className={labelClass}>
                  Password
                </label>
                <input
                  id="new-user-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Minimum length per your policy"
                  autoComplete="new-password"
                />
              </div>
            </div>

            {(showRoleSelector || showManagerSelector || showSupervisorSelector) && (
              <div
                className={`grid gap-5 ${
                  showRoleSelector && (showManagerSelector || showSupervisorSelector)
                    ? "sm:grid-cols-2"
                    : ""
                }`}
              >
                {showRoleSelector ? (
                  <div>
                    <label htmlFor="new-user-role" className={labelClass}>
                      Role
                    </label>
                    <select
                      id="new-user-role"
                      className={inputClass}
                      value={createRole}
                      onChange={(e) => setCreateRole(e.target.value)}
                    >
                      <option value="agent">Agent</option>
                      {role === "admin" ? (
                        <>
                          <option value="manager">Manager</option>
                          <option value="supervisor">Supervisor</option>
                          <option value="lead_monitor">Lead Monitor</option>
                          <option value="admin">Admin</option>
                        </>
                      ) : (
                        <option value="supervisor">Supervisor</option>
                      )}
                    </select>
                  </div>
                ) : null}

                {showManagerSelector ? (
                  <div>
                    <label htmlFor="new-user-manager" className={labelClass}>
                      Assign manager (optional)
                    </label>
                    <select
                      id="new-user-manager"
                      className={inputClass}
                      value={managerId ?? ""}
                      onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">No manager</option>
                      {managerOptions.length === 0 ? (
                        <option value="">No managers available</option>
                      ) : null}
                      {managerOptions.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.username}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {showSupervisorSelector ? (
                  <div>
                    <label htmlFor="new-user-supervisor" className={labelClass}>
                      Assign supervisor (optional)
                    </label>
                    <select
                      id="new-user-supervisor"
                      className={inputClass}
                      value={supervisorId ?? ""}
                      onChange={(e) => setSupervisorId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">No supervisor</option>
                      {supervisorOptions.length === 0 ? (
                        <option value="">No supervisors available</option>
                      ) : null}
                      {filteredSupervisorOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.username}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            )}

            {error ? (
              <p
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
              <button
                type="submit"
                disabled={
                  loading
                }
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-8 text-base font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-emerald-900/20"
              >
                {loading ? (
                  <>
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                      aria-hidden
                    />
                    Creating…
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-5 w-5"
                      aria-hidden
                    >
                      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                    </svg>
                    Create user
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-md shadow-zinc-200/30 ring-1 ring-zinc-950/[0.04] dark:border-zinc-700/80 dark:bg-zinc-900 dark:shadow-none dark:ring-white/5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200/90 bg-zinc-50/90 px-4 py-4 sm:px-6 dark:border-zinc-700 dark:bg-zinc-800/40">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">{listHeading}</h2>
            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
              {users.length === 0 ? "No accounts yet." : listDescription}
              {users.length > 0
                ? ` ${visibleUsersCount} ${visibleUsersCount === 1 ? "person" : "people"} in this list.`
                : null}
            </p>
          </div>
          <div className="flex flex-wrap items-end justify-end gap-3">
            {role === "admin" ? (
              <div className="w-full min-w-0 sm:min-w-[14rem] sm:w-auto">
                <label htmlFor="users-supervisor-filter" className={compactFilterLabelClass}>
                  Supervisor
                </label>
                <select
                  id="users-supervisor-filter"
                  className={compactFilterSelectClass}
                  value={listSupervisorFilter}
                  onChange={(e) => setListSupervisorFilter(e.target.value)}
                >
                  <option value="">All supervisors</option>
                  {supervisorOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.username}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <button
              type="button"
              onClick={onRefreshUsers}
              disabled={listRefreshing}
              className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {listRefreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {listError ? (
            <p
              className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              {listError}
            </p>
          ) : null}
          {displayUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-950/40">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-200/80 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-7 w-7"
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.222zM16.5 15.75c-.911 0-1.868-.328-2.667-.764a10.108 10.108 0 00-1.19-2.684 4.5 4.5 0 00-1.08-.334 41.97 41.97 0 00-.8-.062V15.75c0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75V15c0-.25-.019-.5-.05-.748a41.155 41.155 0 00-.55.195 7.01 7.01 0 00-1.084.632C18.967 15.08 17.69 15.75 16.5 15.75z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <p className="text-base font-medium text-zinc-800 dark:text-zinc-200">
                {users.length === 0 ? "No users yet" : "No users match this filter"}
              </p>
              <p className="mt-1 max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
                {users.length === 0
                  ? "Use the form above to create the first account."
                  : "Try a different supervisor or clear the filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200/80 dark:border-zinc-700">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                    <th className="px-4 py-3.5">Username</th>
                    <th className="px-4 py-3.5">Role</th>
                    <th className="px-4 py-3.5">Presence</th>
                    <th className="px-4 py-3.5">Last active</th>
                    <th className="px-4 py-3.5">Status</th>
                    {showAfterShiftColumn ? (
                      <th className="px-4 py-3.5">After shift</th>
                    ) : null}
                    {showHierarchyColumns ? (
                      <th className="px-4 py-3.5">Supervisor</th>
                    ) : null}
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {displayUsers.map((u) => {
                    const active = u.isActive !== false;
                    return (
                      <tr
                        key={u.id}
                        className={`transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 ${!active ? "opacity-70" : ""}`}
                      >
                        <td className="px-4 py-3.5 font-medium text-zinc-900 dark:text-zinc-100">
                          <button
                            type="button"
                            onClick={() => setViewingUser(u)}
                            className="text-left font-medium text-emerald-700 hover:underline focus:underline focus:outline-none dark:text-emerald-300"
                            title="View status and call logs"
                          >
                            {u.username}
                          </button>
                        </td>
                        <td className="px-4 py-3.5">
                          <RoleBadge value={u.role} />
                        </td>
                        <td className="px-4 py-3.5">
                          <PresenceBadge status={u.presence} />
                        </td>
                        <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300">
                          {formatLastActive(u.lastActiveAt)}
                        </td>
                        <td className="px-4 py-3.5">
                          <ActiveBadge active={active} />
                        </td>
                        {showAfterShiftColumn ? (
                          <td className="px-4 py-3.5">
                            {u.role === "admin" ? (
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">Always</span>
                            ) : (
                              <AfterShiftAccessBadge
                                access={u.afterShiftAccess || "none"}
                                expiresAt={u.afterShiftAccessExpiresAt}
                                grantDurationMinutes={u.afterShiftGrantDurationMinutes}
                              />
                            )}
                          </td>
                        ) : null}
                        {showHierarchyColumns ? (
                          <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300">
                            {u.role === "agent"
                              ? users.find((x) => x.id === u.supervisorId)?.username ??
                                u.supervisorId ??
                                "—"
                              : "—"}
                          </td>
                        ) : null}
                        <td className="px-4 py-3.5 text-right">
                          <UserRowActionsMenu
                            user={u}
                            active={active}
                            isSelf={u.id === currentUserId}
                            busy={rowBusyId === u.id}
                            isAdmin={role === "admin"}
                            onView={() => setViewingUser(u)}
                            onEdit={() => setEditingUser(u)}
                            onDeactivate={() => toggleActive(u, false)}
                            onActivate={() => toggleActive(u, true)}
                            onGrantAfterShift={() => setAfterShiftAccessForUser(u, "full")}
                            onRevokeAfterShift={() => setAfterShiftAccessForUser(u, "none")}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
