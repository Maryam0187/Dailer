"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FILTER_CHIP_CLASS =
  "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800";
const FILTER_CHIP_ACTIVE_CLASS =
  "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-500/60 dark:bg-emerald-950/40 dark:text-emerald-200";

const ROLE_FILTERS = [
  { id: "all", label: "All" },
  { id: "agent", label: "Agent" },
  { id: "supervisor", label: "Supervisor" },
];

const ROLE_LABELS = {
  agent: "Agent",
  supervisor: "Supervisor",
  manager: "Manager",
  admin: "Admin",
  lead_monitor: "Lead monitor",
};

function filterChipClass(active) {
  return `rounded-lg border px-2.5 py-1 text-xs font-semibold ${active ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_CLASS}`;
}

function formatAssigneeLabel(user) {
  if (!user) return "Unassigned";
  if (user.role === "supervisor") return `${user.username} (Supervisor)`;
  if (user.role === "agent" && user.supervisorName) return `${user.username} (${user.supervisorName})`;
  const roleLabel = ROLE_LABELS[user.role] || user.role;
  return `${user.username} (${roleLabel})`;
}

export default function AssigneePicker({
  assignedUserId,
  assignedUsername,
  users = [],
  loading = false,
  saving = false,
  disabled = false,
  onSelect,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [menuPosition, setMenuPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (!q) return true;
      return user.username.toLowerCase().includes(q);
    });
  }, [users, search, roleFilter]);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const menuHeight = 320;
    const width = Math.min(288, window.innerWidth - margin * 2);

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
      setRoleFilter("all");
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        setSearch("");
        setRoleFilter("all");
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
    setRoleFilter("all");
    setMenuPosition(null);
  }

  async function handleSelect(userId) {
    if (saving || disabled || Number(userId) === Number(assignedUserId)) {
      closePicker();
      return;
    }
    closePicker();
    await onSelect?.(userId);
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
                placeholder="Search users…"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ROLE_FILTERS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={roleFilter === option.id}
                    className={filterChipClass(roleFilter === option.id)}
                    onClick={() => setRoleFilter(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {loading ? (
                <p className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">Loading users…</p>
              ) : filteredUsers.length === 0 ? (
                <p className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">No users found</p>
              ) : (
                filteredUsers.map((user) => {
                  const selected = Number(user.id) === Number(assignedUserId);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      disabled={saving}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        selected
                          ? "bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                          : "text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      }`}
                      onClick={() => void handleSelect(user.id)}
                    >
                      <span className="truncate">{formatAssigneeLabel(user)}</span>
                      {selected ? <span className="ml-2 text-xs">Current</span> : null}
                    </button>
                  );
                })
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
        title="Change assignee"
        aria-label="Change assignee"
        aria-haspopup="menu"
        disabled={disabled || saving || loading}
        onClick={() => {
          if (open) {
            closePicker();
            return;
          }
          updateMenuPosition();
          setOpen(true);
        }}
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
