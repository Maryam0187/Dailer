"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { io as ioClient } from "socket.io-client";
import { formatDuration } from "@/lib/formatDuration";

function roleLabel(role) {
  if (role === "agent") return "Agent";
  if (role === "manager") return "Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "admin") return "Admin";
  return role;
}

function normalizePresence(value) {
  if (value === "online" || value === "away" || value === "offline") return value;
  return "offline";
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

function RoleBadge({ value }) {
  const styles = {
    admin: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200",
    manager: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
    supervisor: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200",
    agent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
  };
  const palette =
    value === "admin" || value === "manager" || value === "supervisor" || value === "agent"
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

const menuItemBase =
  "flex w-full items-center rounded-lg border px-3 py-1.5 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50";

const menuViewClass = `${menuItemBase} border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-950/60`;
const menuEditClass = `${menuItemBase} border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800`;
const menuDeactivateClass = `${menuItemBase} border-red-200 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60`;
const menuActivateClass = `${menuItemBase} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60`;

function UserRowActionsMenu({ user, active, isSelf, busy, onView, onEdit, onActivate, onDeactivate }) {
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

function UserDetailModal({ user, currentUserId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [calls, setCalls] = useState([]);
  const [callsError, setCallsError] = useState(null);
  const [callsLoading, setCallsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      fromDate = rangeFrom,
      toDate = rangeTo,
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
    [user.id, callsFilter, rangeFrom, rangeTo],
  );

  async function onRefresh() {
    const controller = new AbortController();
    await loadCalls(controller.signal, page, callsFilter, rangeFrom, rangeTo, {
      silent: calls.length > 0,
    });
  }

  useEffect(() => {
    setCallsFilter("all");
    setRangePreset("today");
    const next = getPresetRange("today");
    setRangeFrom(next.from);
    setRangeTo(next.to);
    setPage(1);
    const controller = new AbortController();
    loadDetail(controller.signal);
    return () => controller.abort();
  }, [user.id, loadDetail]);

  useEffect(() => {
    const controller = new AbortController();
    loadCalls(controller.signal, page, callsFilter, rangeFrom, rangeTo);
    return () => controller.abort();
  }, [user.id, callsFilter, rangeFrom, rangeTo, page, loadCalls]);

  function applyPreset(preset) {
    setRangePreset(preset);
    if (preset === "custom") return;
    const next = getPresetRange(preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
    setPage(1);
  }

  async function onApplyRange() {
    setPage(1);
    const controller = new AbortController();
    await loadCalls(controller.signal, 1, callsFilter, rangeFrom, rangeTo);
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
  const isSelf = user.id === currentUserId;

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
        aria-labelledby="user-detail-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
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

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
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

            <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
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
                <label htmlFor="user-calls-from-date" className={labelClass}>
                  From date
                </label>
                <input
                  id="user-calls-from-date"
                  type="date"
                  className={callsDateInputClass}
                  value={rangeFrom}
                  onChange={(e) => {
                    setRangePreset("custom");
                    setRangeFrom(e.target.value);
                  }}
                  required
                />
              </div>
              <div>
                <label htmlFor="user-calls-to-date" className={labelClass}>
                  To date
                </label>
                <input
                  id="user-calls-to-date"
                  type="date"
                  className={callsDateInputClass}
                  value={rangeTo}
                  onChange={(e) => {
                    setRangePreset("custom");
                    setRangeTo(e.target.value);
                  }}
                  required
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={onApplyRange}
                  disabled={callsLoading}
                  className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Apply range
                </button>
              </div>
            </div>
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
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                    <th className="px-3 py-2.5">When</th>
                    {callsFilter === "conference" ? (
                      <th className="px-3 py-2.5">Invited</th>
                    ) : null}
                    <th className="px-3 py-2.5">To</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Duration</th>
                    <th className="px-3 py-2.5">Recording</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {calls.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-200">
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
                      <td className="px-3 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                        {formatDuration(c.durationSeconds)}
                      </td>
                      <td className="px-3 py-2.5">
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
          )}

          {!callsLoading && !callsError && calls.length > 0 ? (
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Showing {calls.length} of {pagination.total}{" "}
              {callsFilter === "conference" ? "conference calls" : "calls"}
              {callsFilter === "recording" ? " with a recording" : ""}
            </p>
          ) : null}
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setUsername(user.username);
    setPassword("");
    setEditRole(user.role);
    setManagerId(user.managerId ?? "");
    setSupervisorId(user.supervisorId ?? "");
    setIsActive(user.isActive !== false);
    setError(null);
  }, [user]);

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
    presence: normalizePresence(u.presence),
    lastActiveAt: u.lastActiveAt ?? null,
  }));
}

export default function UsersClient({ role, managers, supervisors, initialUsers, currentUserId }) {
  const [users, setUsers] = useState(() => normalizeUsersList(initialUsers));
  const applyPresenceUpdateRef = useRef(null);
  const refreshUsersPresenceRef = useRef(null);
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

  const managerMap = useMemo(() => {
    const map = new Map();
    for (const u of users) {
      if (u.role === "manager") map.set(u.id, u.username);
    }
    return map;
  }, [users]);

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

  const refreshUsersPresence = useCallback(async () => {
    try {
      const res = await fetch("/api/users", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      applyUsersList(json.users || []);
    } catch {
      /* background refresh */
    }
  }, [applyUsersList]);

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
  refreshUsersPresenceRef.current = refreshUsersPresence;

  useEffect(() => {
    void refreshUsersPresence();

    const socket = ioClient({
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socket.on("presence:update", (payload) => {
      applyPresenceUpdateRef.current?.(payload);
    });
    socket.on("presence:sync", () => {
      void refreshUsersPresenceRef.current?.();
    });
    socket.on("connect", () => {
      void refreshUsersPresenceRef.current?.();
    });

    const interval = window.setInterval(() => {
      void refreshUsersPresenceRef.current?.();
    }, 10000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshUsersPresenceRef.current?.();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      socket.disconnect();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshUsersPresence]);

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

  const isManager = role === "manager";
  const isSupervisor = role === "supervisor";
  const showRoleSelector = role === "admin" || isManager;
  const showManagerSelector =
    role === "admin" && (createRole === "agent" || createRole === "supervisor");
  const showSupervisorSelector =
    (role === "admin" && createRole === "agent") || (isManager && createRole === "agent");
  const listHeading =
    role === "admin" ? "All users" : isManager ? "Your team" : "Your agents";
  const listDescription =
    role === "admin"
      ? "Everyone in the system."
      : isManager
        ? "Agents and supervisors assigned to you."
        : "Agents assigned to you as their supervisor.";
  const showHierarchyColumns = !isSupervisor;
  const filteredSupervisorOptions =
    managerId == null || managerId === ""
      ? supervisorOptions
      : supervisorOptions.filter((s) => Number(s.managerId) === Number(managerId));

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
        <div className="border-b border-zinc-200/90 bg-zinc-50/90 px-6 py-4 dark:border-zinc-700 dark:bg-zinc-800/40">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">{listHeading}</h2>
          <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
            {users.length === 0 ? "No accounts yet." : listDescription}
            {users.length > 0
              ? ` ${users.length} ${users.length === 1 ? "person" : "people"} in this list.`
              : null}
          </p>
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
          {users.length === 0 ? (
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
              <p className="text-base font-medium text-zinc-800 dark:text-zinc-200">No users yet</p>
              <p className="mt-1 max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
                Use the form above to create the first account.
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
                    {showHierarchyColumns ? (
                      <>
                        <th className="px-4 py-3.5">Manager</th>
                        <th className="px-4 py-3.5">Supervisor</th>
                      </>
                    ) : null}
                    <th className="px-4 py-3.5">Created</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {users.map((u) => {
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
                        {showHierarchyColumns ? (
                          <>
                            <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300">
                              {u.role === "agent" || u.role === "supervisor"
                                ? managerMap.get(u.managerId) ?? u.managerId ?? "—"
                                : "—"}
                            </td>
                            <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300">
                              {u.role === "agent"
                                ? users.find((x) => x.id === u.supervisorId)?.username ??
                                  u.supervisorId ??
                                  "—"
                                : "—"}
                            </td>
                          </>
                        ) : null}
                        <td className="px-4 py-3.5 tabular-nums text-zinc-600 dark:text-zinc-300">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <UserRowActionsMenu
                            user={u}
                            active={active}
                            isSelf={u.id === currentUserId}
                            busy={rowBusyId === u.id}
                            onView={() => setViewingUser(u)}
                            onEdit={() => setEditingUser(u)}
                            onDeactivate={() => toggleActive(u, false)}
                            onActivate={() => toggleActive(u, true)}
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
