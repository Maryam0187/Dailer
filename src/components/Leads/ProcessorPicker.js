"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function normalizePresence(value) {
  if (value === "online" || value === "away" || value === "offline") return value;
  return "offline";
}

function PresenceIndicator({ status }) {
  const value = normalizePresence(status);
  const styles = {
    online: { dot: "bg-emerald-500", label: "Online" },
    away: { dot: "bg-amber-500", label: "Away" },
    offline: { dot: "bg-zinc-400", label: "Offline" },
  };
  const s = styles[value];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

export default function ProcessorPicker({
  processorUserId,
  saving = false,
  disabled = false,
  onSelect,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [processors, setProcessors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);

  const loadProcessors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users/processors", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setProcessors(json.processors || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredProcessors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return processors;
    return processors.filter((user) => user.username.toLowerCase().includes(q));
  }, [processors, search]);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const menuHeight = 320;
    const width = Math.min(320, window.innerWidth - margin * 2);

    const openUpward = rect.bottom + gap + menuHeight > window.innerHeight;
    const top = openUpward ? rect.top - gap : rect.bottom + gap;

    let left = rect.right - width;
    const maxLeft = window.innerWidth - width - margin;
    if (left > maxLeft) left = maxLeft;
    if (left < margin) left = margin;

    setMenuPosition({
      top,
      left,
      width,
      transform: openUpward ? "translateY(-100%)" : undefined,
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
    const timer = setTimeout(() => searchRef.current?.focus(), 0);
    function onPointerDown(event) {
      const target = event.target;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setSearch("");
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function closePicker() {
    setOpen(false);
    setSearch("");
    setMenuPosition(null);
  }

  async function handleSelect(userId) {
    if (saving || disabled) {
      closePicker();
      return;
    }
    const nextId = userId != null ? Number(userId) : null;
    if (nextId != null && Number(nextId) === Number(processorUserId)) {
      closePicker();
      return;
    }
    if (nextId == null && processorUserId == null) {
      closePicker();
      return;
    }
    closePicker();
    await onSelect?.(nextId);
  }

  function openPicker() {
    if (open) {
      closePicker();
      return;
    }
    updateMenuPosition();
    setOpen(true);
    void loadProcessors();
  }

  const menu =
    open && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[100] flex max-h-80 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg ring-1 ring-zinc-950/5 dark:border-zinc-600 dark:bg-zinc-900 dark:ring-white/10"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
              transform: menuPosition.transform,
            }}
          >
            <div className="border-b border-zinc-200 p-2 dark:border-zinc-700">
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search processors…"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {loading ? (
                <p className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">Loading processors…</p>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={saving}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      processorUserId == null
                        ? "bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    }`}
                    onClick={() => void handleSelect(null)}
                  >
                    <span className="min-w-0 flex-1 truncate">Select</span>
                    {processorUserId == null ? <span className="shrink-0 text-xs">Current</span> : null}
                  </button>
                  {filteredProcessors.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">No processors found</p>
                  ) : (
                    filteredProcessors.map((user) => {
                      const selected = Number(user.id) === Number(processorUserId);
                      const pending = Number(user.pendingProcessingCount) || 0;
                      return (
                        <button
                          key={user.id}
                          type="button"
                          disabled={saving}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            selected
                              ? "bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                              : "text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          }`}
                          onClick={() => void handleSelect(user.id)}
                        >
                          <span className="min-w-0 flex-1 truncate">{user.username}</span>
                          <PresenceIndicator status={user.presence} />
                          <span
                            className={`shrink-0 text-xs ${
                              pending > 0
                                ? "font-semibold text-violet-700 dark:text-violet-300"
                                : "text-zinc-400 dark:text-zinc-500"
                            }`}
                          >
                            {pending} pending
                          </span>
                          {selected ? <span className="shrink-0 text-xs">Current</span> : null}
                        </button>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title="Change processor"
        aria-label="Change processor"
        aria-haspopup="menu"
        disabled={disabled || saving}
        onClick={openPicker}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 shadow-sm outline-none transition-colors hover:border-emerald-500/60 hover:text-emerald-600 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-emerald-300"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden>
          <path
            d="M13.5 3.5l3 3L7 16l-3.5.5L4 13l9.5-9.5z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {menu}
    </>
  );
}
