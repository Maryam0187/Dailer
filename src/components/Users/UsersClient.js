"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { io as ioClient } from "socket.io-client";
import { sortUsersForDisplay } from "@/lib/sortUsers";
import { isLeadSupervisor } from "@/lib/leadRoles";
import { useMessaging } from "@/contexts/MessagingContext";
import UserNameLabel from "@/components/UserNameLabel";

function roleLabel(role) {
  if (role === "agent") return "Agent";
  if (role === "manager") return "Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "admin") return "Admin";
  if (role === "lead_supervisor") return "Lead Supervisor";
  if (role === "processor") return "Processor";
  return role;
}

function isAgentSupervisorRole(role) {
  return role === "supervisor" || role === "lead_supervisor";
}

function supervisorSelectLabel(s) {
  if (s.role === "lead_supervisor") return `${s.username} (Lead supervisor)`;
  return s.username;
}

function normalizePresence(value) {
  if (value === "online" || value === "away" || value === "offline") return value;
  return "offline";
}

function formatDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
}

function formatLastActive(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 0) return formatDateOnly(date) || "Unknown";
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return formatDateOnly(date) || "Unknown";
}

function todayIsoDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatLeaveRange(leave) {
  if (!leave?.startDate || !leave?.endDate) return "On leave";
  if (leave.startDate === leave.endDate) return leave.startDate;
  return `${leave.startDate} - ${leave.endDate}`;
}

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-emerald-400/70 dark:focus:ring-emerald-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";
const compactFilterLabelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const compactFilterSelectClass =
  "h-9 min-w-[14rem] rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-emerald-400/70 dark:focus:ring-emerald-400/20";
const compactFilterInputClass =
  "h-9 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-emerald-400/70 dark:focus:ring-emerald-400/20 sm:min-w-[12rem]";

function RoleBadge({ value }) {
  const styles = {
    admin: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200",
    lead_supervisor: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-200",
    processor: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200",
    manager: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
    supervisor: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200",
    agent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
  };
  const palette =
    value === "admin" ||
    value === "lead_supervisor" ||
    value === "processor" ||
    value === "manager" ||
    value === "supervisor" ||
    value === "agent"
      ? styles[value]
      : "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200";
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${palette}`}>
      {roleLabel(value)}
    </span>
  );
}

function StatusDot({ colorClass, label, title }) {
  return (
    <span
      className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-zinc-900 ${colorClass}`}
      title={title || label}
      aria-label={label}
      role="img"
    />
  );
}

function ActiveBadge({ active, compact = false }) {
  if (compact) {
    return (
      <StatusDot
        colorClass={active ? "bg-emerald-500" : "bg-zinc-400"}
        label={active ? "Active" : "Inactive"}
      />
    );
  }
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

function LeaveBadge({ leave, showDates = true, compact = false }) {
  if (compact) {
    if (!leave) {
      return <StatusDot colorClass="bg-zinc-300 dark:bg-zinc-600" label="Not on leave" />;
    }
    return (
      <StatusDot
        colorClass="bg-amber-500"
        label="On leave"
        title={`On leave · ${formatLeaveRange(leave)}`}
      />
    );
  }
  if (!leave) {
    return <span className="text-xs text-zinc-500 dark:text-zinc-400">—</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
        On leave
      </span>
      {showDates ? (
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{formatLeaveRange(leave)}</span>
      ) : null}
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

function formatGrantTimeRemaining(expiresAt) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return minutes === 1 ? "1 min left" : `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return hours === 1 ? "1 hour left" : `${hours} hours left`;
  return `${hours}h ${rem}m left`;
}

function LoginWindowBadge({ exempt, role, compact = false }) {
  if (compact) {
    if (role === "admin") {
      return <StatusDot colorClass="bg-sky-500" label="Always open" />;
    }
    if (exempt) {
      return <StatusDot colorClass="bg-emerald-500" label="Window lifted" />;
    }
    return <StatusDot colorClass="bg-zinc-400" label="Window restricted" />;
  }
  if (role === "admin") {
    return <span className="text-xs text-zinc-500 dark:text-zinc-400">Always open</span>;
  }
  if (exempt) {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
        Lifted
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      Restricted
    </span>
  );
}

function AfterShiftAccessBadge({
  access,
  expiresAt,
  grantDurationMinutes,
  isCustomGrantDuration = false,
  compact = false,
}) {
  const durationLabel = grantDurationMinutes ? grantDurationLabel(grantDurationMinutes) : null;
  const durationHint = durationLabel
    ? isCustomGrantDuration
      ? durationLabel
      : `${durationLabel} (default)`
    : null;
  const remainingLabel = formatGrantTimeRemaining(expiresAt);
  const expiryLabel = expiresAt ? formatGrantExpiry(expiresAt) : null;

  if (compact) {
    const titleParts = [];
    if (access === "full") titleParts.push("Full after-shift");
    else if (access === "limited") titleParts.push("Limited after-shift");
    else titleParts.push("No after-shift access");
    if (remainingLabel && expiryLabel) titleParts.push(`${remainingLabel} · until ${expiryLabel}`);
    else if (durationHint && (access === "full" || access === "limited")) {
      titleParts.push(`${durationHint} each grant`);
    }
    const colorClass =
      access === "full" ? "bg-sky-500" : access === "limited" ? "bg-amber-500" : "bg-zinc-300 dark:bg-zinc-600";
    return <StatusDot colorClass={colorClass} label={titleParts[0]} title={titleParts.join(" · ")} />;
  }

  if (access === "full") {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
          Full
        </span>
        {remainingLabel && expiryLabel ? (
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            {durationHint ? `${durationHint} · ` : ""}
            {remainingLabel} · until {expiryLabel}
          </span>
        ) : durationHint ? (
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{durationHint} each grant</span>
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
        {remainingLabel && expiryLabel ? (
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            {durationHint ? `${durationHint} · ` : ""}
            {remainingLabel} · until {expiryLabel}
          </span>
        ) : durationHint ? (
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{durationHint} each grant</span>
        ) : null}
      </span>
    );
  }
  return (
    <span className="text-xs text-zinc-500 dark:text-zinc-400">
      {durationHint ? `${durationHint} when granted` : "—"}
    </span>
  );
}

function PresenceBadge({ status, compact = false }) {
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
  if (compact) {
    return <StatusDot colorClass={s.dot} label={s.label} />;
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
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
  onEdit,
  onMessage,
  onActivate,
  onDeactivate,
  onGrantAfterShift,
  onRevokeAfterShift,
  onLiftWindowRestriction,
  onAddWindowRestriction,
  onMarkLeave,
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
        <button type="button" role="menuitem" className={menuEditClass} onClick={() => runAction(onEdit)}>
          Edit
        </button>
        {!isSelf && active && onMessage ? (
          <button type="button" role="menuitem" className={menuViewClass} onClick={() => runAction(onMessage)}>
            Message
          </button>
        ) : null}
        {isAdmin && user.role !== "admin" && active ? (
          <button type="button" role="menuitem" className={menuEditClass} onClick={() => runAction(onMarkLeave)}>
            Mark leave
          </button>
        ) : null}
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
          user.loginWindowExempt ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              className={menuDeactivateClass}
              onClick={() => runAction(onAddWindowRestriction)}
            >
              {busy ? "Updating…" : "Add window restriction"}
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              className={menuActivateClass}
              onClick={() => runAction(onLiftWindowRestriction)}
            >
              {busy ? "Updating…" : "Lift window restriction"}
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
  const isManager = viewerRole === "manager";
  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [password, setPassword] = useState("");
  const [editRole, setEditRole] = useState(user.role);
  const [managerId, setManagerId] = useState(user.managerId ?? "");
  const [supervisorId, setSupervisorId] = useState(user.supervisorId ?? "");
  const [shiftKey, setShiftKey] = useState(user.shiftKey === "night" ? "night" : "day");
  const [isActive, setIsActive] = useState(user.isActive !== false);
  const [isOutside, setIsOutside] = useState(Boolean(user.isOutside));
  const [canUseDialer2, setCanUseDialer2] = useState(Boolean(user.canUseDialer2));
  const [canTrainAddressBot, setCanTrainAddressBot] = useState(Boolean(user.canTrainAddressBot));
  const [canReceiveSharedLeads, setCanReceiveSharedLeads] = useState(
    Boolean(user.canReceiveSharedLeads),
  );
  const [selectsLeadSupervisor, setSelectsLeadSupervisor] = useState(
    Boolean(user.selectsLeadSupervisor),
  );
  const [loginWindowExempt, setLoginWindowExempt] = useState(Boolean(user.loginWindowExempt));
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
  const [leaveStartDate, setLeaveStartDate] = useState(() => user.currentLeave?.startDate ?? todayIsoDate());
  const [leaveEndDate, setLeaveEndDate] = useState(() => user.currentLeave?.endDate ?? todayIsoDate());
  const [leaveReason, setLeaveReason] = useState(() => user.currentLeave?.reason ?? "");
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(user.totpEnabled === true);
  const [resettingTotp, setResettingTotp] = useState(false);

  useEffect(() => {
    setUsername(user.username);
    setDisplayName(user.displayName || "");
    setPassword("");
    setEditRole(user.role);
    setManagerId(user.managerId ?? "");
    setSupervisorId(user.supervisorId ?? "");
    setShiftKey(user.shiftKey === "night" ? "night" : "day");
    setIsActive(user.isActive !== false);
    setIsOutside(Boolean(user.isOutside));
    setCanUseDialer2(Boolean(user.canUseDialer2));
    setCanTrainAddressBot(Boolean(user.canTrainAddressBot));
    setCanReceiveSharedLeads(Boolean(user.canReceiveSharedLeads));
    setSelectsLeadSupervisor(Boolean(user.selectsLeadSupervisor));
    setLoginWindowExempt(Boolean(user.loginWindowExempt));
    setAfterShiftAccess(user.afterShiftAccess || "none");
    setGrantDurationMinutes(user.afterShiftGrantDurationMinutes ?? 120);
    setLimitedFileId(user.afterShiftLimitedFileId != null ? String(user.afterShiftLimitedFileId) : "");
    setLeaveStartDate(user.currentLeave?.startDate ?? todayIsoDate());
    setLeaveEndDate(user.currentLeave?.endDate ?? todayIsoDate());
    setLeaveReason(user.currentLeave?.reason ?? "");
    setTotpEnabled(user.totpEnabled === true);
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
          const globalDefault =
            json.shifts?.day?.afterShiftGrantDurationMinutes ||
            json.settings?.afterShiftGrantDurationMinutes ||
            120;
          setGrantDurationMinutes(
            user.afterShiftGrantDurationMinutes != null
              ? user.afterShiftGrantDurationMinutes
              : globalDefault,
          );
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
        const nextDisplay = displayName.trim().replace(/\s+/g, " ");
        const prevDisplay = (user.displayName || "").trim();
        if (nextDisplay !== prevDisplay) {
          payload.displayName = nextDisplay;
        }
        const rolesWithManager = ["agent", "supervisor", "processor", "lead_supervisor"];
        if (editRole !== user.role) {
          payload.role = editRole;
          if (rolesWithManager.includes(editRole)) {
            payload.managerId = managerId === "" || managerId == null ? null : Number(managerId);
          }
          if (editRole === "agent") {
            payload.supervisorId =
              supervisorId === "" || supervisorId == null ? null : Number(supervisorId);
          }
        } else if (rolesWithManager.includes(editRole)) {
          const mid = managerId === "" || managerId == null ? null : Number(managerId);
          const prev = user.managerId != null ? Number(user.managerId) : null;
          if (mid !== prev) {
            payload.managerId = mid;
          }
          if (editRole === "agent") {
            const sid = supervisorId === "" || supervisorId == null ? null : Number(supervisorId);
            const prevSid = user.supervisorId != null ? Number(user.supervisorId) : null;
            if (sid !== prevSid) payload.supervisorId = sid;
          }
        }

        const nextShiftKey = editRole === "admin" ? "day" : shiftKey === "night" ? "night" : "day";
        const prevShiftKey = user.shiftKey === "night" ? "night" : "day";
        if (nextShiftKey !== prevShiftKey || (editRole === "admin" && prevShiftKey !== "day")) {
          payload.shiftKey = nextShiftKey;
        }
      } else if (isManager && user.role !== "admin") {
        const nextShiftKey = shiftKey === "night" ? "night" : "day";
        const prevShiftKey = user.shiftKey === "night" ? "night" : "day";
        if (nextShiftKey !== prevShiftKey) {
          payload.shiftKey = nextShiftKey;
        }
      }

      if (isActive !== (user.isActive !== false)) payload.isActive = isActive;
      if (isAdmin && editRole !== "admin" && Boolean(isOutside) !== Boolean(user.isOutside)) {
        payload.isOutside = isOutside;
      }
      if (isAdmin && Boolean(canUseDialer2) !== Boolean(user.canUseDialer2)) {
        payload.canUseDialer2 = canUseDialer2;
      }
      if (isAdmin && Boolean(canTrainAddressBot) !== Boolean(user.canTrainAddressBot)) {
        payload.canTrainAddressBot = canTrainAddressBot;
      }
      if (isAdmin && Boolean(canReceiveSharedLeads) !== Boolean(user.canReceiveSharedLeads)) {
        payload.canReceiveSharedLeads = canReceiveSharedLeads;
      }
      if (
        (isAdmin || isManager) &&
        editRole === "agent" &&
        Boolean(selectsLeadSupervisor) !== Boolean(user.selectsLeadSupervisor)
      ) {
        payload.selectsLeadSupervisor = selectsLeadSupervisor;
      } else if ((isAdmin || isManager) && editRole !== "agent" && user.selectsLeadSupervisor) {
        payload.selectsLeadSupervisor = false;
      }
      if (
        isAdmin &&
        user.role !== "admin" &&
        Boolean(loginWindowExempt) !== Boolean(user.loginWindowExempt)
      ) {
        payload.loginWindowExempt = loginWindowExempt;
      }
      if (isAdmin && editRole === "admin" && user.isOutside) {
        payload.isOutside = false;
      }

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

  async function onMarkLeave() {
    setError(null);
    setLeaveSubmitting(true);
    try {
      const res = await fetch("/api/leave-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: user.id,
          startDate: leaveStartDate,
          endDate: leaveEndDate,
          reason: leaveReason,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to mark leave");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to mark leave");
    } finally {
      setLeaveSubmitting(false);
    }
  }

  const showManager =
    isAdmin &&
    (editRole === "agent" ||
      editRole === "supervisor" ||
      editRole === "processor" ||
      editRole === "lead_supervisor");
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
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2 id="edit-user-title" className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Edit user
        </h2>
        <p className="mt-1">
          <UserNameLabel
            displayName={user.displayName}
            username={user.username}
            displayClassName="text-sm font-semibold text-zinc-800 dark:text-zinc-200"
            usernameClassName="text-xs font-normal text-zinc-400 dark:text-zinc-500"
            truncate={false}
          />
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          {isAdmin && user.role !== "admin" && user.isActive !== false ? (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Mark on leave</p>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  Creates an approved leave record and blocks sign-in during those dates.
                </p>
              </div>
              {user.currentLeave ? (
                <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                  Current leave: {formatLeaveRange(user.currentLeave)}
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Start date
                  <input
                    type="date"
                    className={`${inputClass} mt-1.5`}
                    value={leaveStartDate}
                    min={todayIsoDate()}
                    onChange={(e) => {
                      const next = e.target.value;
                      setLeaveStartDate(next);
                      if (leaveEndDate && next && leaveEndDate < next) setLeaveEndDate(next);
                    }}
                  />
                </label>
                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  End date
                  <input
                    type="date"
                    className={`${inputClass} mt-1.5`}
                    value={leaveEndDate}
                    min={
                      leaveStartDate && leaveStartDate > todayIsoDate()
                        ? leaveStartDate
                        : todayIsoDate()
                    }
                    onChange={(e) => setLeaveEndDate(e.target.value)}
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Reason <span className="font-normal text-zinc-500">(optional)</span>
                <input
                  type="text"
                  className={`${inputClass} mt-1.5`}
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Optional leave note"
                />
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={leaveSubmitting}
                  onClick={() => void onMarkLeave()}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {leaveSubmitting ? "Marking…" : "Mark on leave"}
                </button>
              </div>
            </div>
          ) : null}

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

          {isAdmin ? (
            <div>
              <label htmlFor="edit-display-name" className={labelClass}>
                Display name
              </label>
              <input
                id="edit-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={128}
                className={inputClass}
                placeholder={user.displayName || "How this name appears in chat"}
                autoComplete="off"
              />
              <p className="mt-1.5 flex flex-wrap items-baseline gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                {displayName.trim() || user.displayName ? (
                  <>
                    <span>Shown in messages as</span>
                    <UserNameLabel
                      displayName={displayName.trim() || user.displayName}
                      username={username.trim() || user.username}
                      displayClassName="text-sm font-semibold text-zinc-800 dark:text-zinc-200"
                      usernameClassName="text-xs font-normal text-zinc-400 dark:text-zinc-500"
                      truncate={false}
                    />
                  </>
                ) : (
                  <span>Leave blank to use username only.</span>
                )}
              </p>
            </div>
          ) : null}

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

          {isAdmin && totpEnabled ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Two-factor authentication is enabled
              </p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Reset if this user lost access to their authenticator app. They can set it up again
                from Security.
              </p>
              <button
                type="button"
                disabled={resettingTotp || loading}
                onClick={async () => {
                  if (!window.confirm(`Reset two-factor authentication for ${user.username}?`)) {
                    return;
                  }
                  setError(null);
                  setResettingTotp(true);
                  try {
                    const res = await fetch(`/api/users/${user.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ resetTotp: true }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(json?.error || "Failed to reset 2FA");
                    setTotpEnabled(false);
                    await onSaved?.();
                  } catch (err) {
                    setError(err.message || "Failed to reset 2FA");
                  } finally {
                    setResettingTotp(false);
                  }
                }}
                className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/40"
              >
                {resettingTotp ? "Resetting…" : "Reset 2FA"}
              </button>
            </div>
          ) : null}

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
                  <option value="processor">Processor</option>
                  <option value="lead_supervisor">Lead Supervisor</option>
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
                        {s.role === "lead_supervisor" ? `${s.username} (Lead supervisor)` : s.username}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {editRole !== "admin" ? (
                <div>
                  <label htmlFor="edit-shift" className={labelClass}>
                    Shift
                  </label>
                  <select
                    id="edit-shift"
                    className={inputClass}
                    value={shiftKey}
                    onChange={(e) => setShiftKey(e.target.value === "night" ? "night" : "day")}
                  >
                    <option value="day">Day (6:00 PM – 11:00 PM PKT)</option>
                    <option value="night">Night (1:00 AM – 6:00 AM PKT)</option>
                  </select>
                </div>
              ) : null}
            </>
          ) : isManager && user.role !== "admin" ? (
            <div>
              <label htmlFor="edit-shift" className={labelClass}>
                Shift
              </label>
              <select
                id="edit-shift"
                className={inputClass}
                value={shiftKey}
                onChange={(e) => setShiftKey(e.target.value === "night" ? "night" : "day")}
              >
                <option value="day">Day (6:00 PM – 11:00 PM PKT)</option>
                <option value="night">Night (1:00 AM – 6:00 AM PKT)</option>
              </select>
            </div>
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

          {isAdmin && editRole !== "admin" ? (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
              <input
                id="edit-outside"
                type="checkbox"
                checked={isOutside}
                onChange={(e) => setIsOutside(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
              />
              <label htmlFor="edit-outside" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Outside staff
                <span className="ml-1 font-normal text-zinc-500">
                  (can be assigned to outside customers)
                </span>
              </label>
            </div>
          ) : null}

          {isAdmin ? (
            <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800 dark:bg-violet-950/30">
              <input
                id="edit-dialer2"
                type="checkbox"
                checked={canUseDialer2}
                onChange={(e) => setCanUseDialer2(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
              />
              <label htmlFor="edit-dialer2" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Allow second dialer
                <span className="ml-1 font-normal text-zinc-500">
                  (parallel outbound Line 2)
                </span>
              </label>
            </div>
          ) : null}

          {isAdmin ? (
            <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-800 dark:bg-sky-950/30">
              <input
                id="edit-address-bot-train"
                type="checkbox"
                checked={canTrainAddressBot}
                onChange={(e) => setCanTrainAddressBot(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-sky-600 focus:ring-sky-500"
              />
              <label htmlFor="edit-address-bot-train" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Allow Address bot training
                <span className="ml-1 font-normal text-zinc-500">
                  (edit the shared prompt and Q&amp;A)
                </span>
              </label>
            </div>
          ) : null}

          {isAdmin ? (
            <div className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 dark:border-teal-800 dark:bg-teal-950/30">
              <input
                id="edit-shared-view"
                type="checkbox"
                checked={canReceiveSharedLeads}
                onChange={(e) => setCanReceiveSharedLeads(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
              />
              <label htmlFor="edit-shared-view" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Shared view access
                <span className="ml-1 font-normal text-zinc-500">
                  (can receive view-only shared sales and see Shared with me)
                </span>
              </label>
            </div>
          ) : null}

          {(isAdmin || isManager) && editRole === "agent" ? (
            <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-800 dark:bg-rose-950/30">
              <input
                id="edit-selects-lead-supervisor"
                type="checkbox"
                checked={selectsLeadSupervisor}
                onChange={(e) => setSelectsLeadSupervisor(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-rose-600 focus:ring-rose-500"
              />
              <label
                htmlFor="edit-selects-lead-supervisor"
                className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
              >
                Agent selects lead supervisor
                <span className="ml-1 font-normal text-zinc-500">
                  (do not auto-assign to linked supervisor; agent picks same-shift supervisor)
                </span>
              </label>
            </div>
          ) : null}

          {isAdmin && user.role !== "admin" ? (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
              <input
                id="edit-login-window-exempt"
                type="checkbox"
                checked={loginWindowExempt}
                onChange={(e) => setLoginWindowExempt(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
              />
              <label
                htmlFor="edit-login-window-exempt"
                className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
              >
                Lift window restriction
                <span className="ml-1 font-normal text-zinc-500">
                  (permanent; user can sign in outside their day/night login window)
                </span>
              </label>
            </div>
          ) : null}

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
    displayName: u.displayName ? String(u.displayName) : null,
    isActive: u.isActive !== false && u.isActive !== 0,
    isOutside: Boolean(u.isOutside),
    canUseDialer2: Boolean(u.canUseDialer2),
    canTrainAddressBot: Boolean(u.canTrainAddressBot),
    canReceiveSharedLeads: Boolean(u.canReceiveSharedLeads),
    selectsLeadSupervisor: u.role === "agent" ? Boolean(u.selectsLeadSupervisor) : false,
    loginWindowExempt: Boolean(u.loginWindowExempt),
    shiftKey: u.shiftKey === "night" ? "night" : "day",
    afterShiftAccess: u.afterShiftAccess || "none",
    afterShiftLimitedFileId: u.afterShiftLimitedFileId ?? null,
    afterShiftAccessExpiresAt: u.afterShiftAccessExpiresAt ?? null,
    afterShiftGrantDurationMinutes: u.afterShiftGrantDurationMinutes ?? null,
    isOnLeave: Boolean(u.currentLeave ?? u.isOnLeave),
    currentLeave: u.currentLeave ?? null,
    presence: normalizePresence(u.presence),
    lastActiveAt: u.lastActiveAt ?? null,
  }));
}

export default function UsersClient({ role, managers, supervisors, initialUsers, currentUserId }) {
  const { startCompose } = useMessaging();
  const [users, setUsers] = useState(() => normalizeUsersList(initialUsers));
  const [defaultGrantDurationMinutes, setDefaultGrantDurationMinutes] = useState(120);
  const applyPresenceUpdateRef = useRef(null);
  const [managerOptions, setManagerOptions] = useState(managers ?? []);
  const [supervisorOptions, setSupervisorOptions] = useState(supervisors ?? []);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [createRole, setCreateRole] = useState(role === "admin" ? "agent" : "agent");
  const [createShiftKey, setCreateShiftKey] = useState("day");
  const [createIsOutside, setCreateIsOutside] = useState(false);
  const [createCanReceiveSharedLeads, setCreateCanReceiveSharedLeads] = useState(false);
  const [createSelectsLeadSupervisor, setCreateSelectsLeadSupervisor] = useState(false);
  const [managerId, setManagerId] = useState(managers[0]?.id ?? null);
  const [supervisorId, setSupervisorId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [editingUser, setEditingUser] = useState(null);
  const [rowBusyId, setRowBusyId] = useState(null);
  const [listError, setListError] = useState(null);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [listSupervisorFilter, setListSupervisorFilter] = useState("");
  const [listShiftFilter, setListShiftFilter] = useState("day");
  const [listOutsideFilter, setListOutsideFilter] = useState("inhouse");
  const [listActiveFilter, setListActiveFilter] = useState("active");
  const [listNameSearch, setListNameSearch] = useState("");
  const createPasswordOptional = role === "admin" && createRole === "agent" && createIsOutside;

  const displayUsers = useMemo(() => {
    let sortedUsers = sortUsersForDisplay(users);
    const nameQuery = listNameSearch.trim().toLowerCase();
    if (nameQuery) {
      sortedUsers = sortedUsers.filter((u) => {
        const username = String(u.username || "").toLowerCase();
        const display = String(u.displayName || "").toLowerCase();
        return username.includes(nameQuery) || display.includes(nameQuery);
      });
    }

    if (listActiveFilter === "active") {
      sortedUsers = sortedUsers.filter((u) => u.isActive !== false);
    } else if (listActiveFilter === "inactive") {
      sortedUsers = sortedUsers.filter((u) => u.isActive === false);
    }

    if (role !== "admin" && role !== "manager") return sortedUsers;

    if (listShiftFilter === "day" || listShiftFilter === "night") {
      sortedUsers = sortedUsers.filter(
        (u) => (u.shiftKey === "night" ? "night" : "day") === listShiftFilter,
      );
    }

    if (listOutsideFilter === "outside") {
      sortedUsers = sortedUsers.filter((u) => Boolean(u.isOutside));
    } else if (listOutsideFilter === "inhouse") {
      sortedUsers = sortedUsers.filter((u) => !u.isOutside);
    }

    if (role !== "admin" || !listSupervisorFilter) return sortedUsers;

    const supervisorId = Number(listSupervisorFilter);
    return sortedUsers.filter(
      (u) => u.role === "agent" && Number(u.supervisorId) === supervisorId,
    );
  }, [
    users,
    role,
    listSupervisorFilter,
    listShiftFilter,
    listOutsideFilter,
    listActiveFilter,
    listNameSearch,
  ]);

  const listSupervisorOptions = useMemo(() => {
    if (role !== "admin" || (listShiftFilter !== "day" && listShiftFilter !== "night")) {
      return supervisorOptions;
    }
    return supervisorOptions.filter(
      (s) => (s.shiftKey === "night" ? "night" : "day") === listShiftFilter,
    );
  }, [supervisorOptions, role, listShiftFilter]);

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
          .filter((u) => isAgentSupervisorRole(u.role) && u.isActive)
          .map((u) => ({
            id: u.id,
            username: u.username,
            role: u.role,
            managerId: u.managerId,
            shiftKey: u.shiftKey === "night" ? "night" : "day",
          }))
          .sort((a, b) => a.username.localeCompare(b.username));
        setSupervisorOptions(nextSupervisors);
      } else if (role === "manager") {
        const nextSupervisors = normalizedUsers
          .filter((u) => isAgentSupervisorRole(u.role) && u.isActive)
          .map((u) => ({
            id: u.id,
            username: u.username,
            role: u.role,
            managerId: u.managerId,
            shiftKey: u.shiftKey === "night" ? "night" : "day",
          }))
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
      prev.map((u) => {
        if (Number(u.id) !== userId) return u;
        return {
          ...u,
          presence: nextPresence,
          lastActiveAt: lastActiveAt ?? u.lastActiveAt ?? null,
        };
      }),
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

    async function loadDefaultGrantDuration() {
      try {
        const res = await fetch("/api/shift/settings", { credentials: "include", cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setDefaultGrantDurationMinutes(
            json.shifts?.day?.afterShiftGrantDurationMinutes ||
              json.settings?.afterShiftGrantDurationMinutes ||
              120,
          );
        }
      } catch {
        /* use default */
      }
    }

    void loadDefaultGrantDuration();

    function onShiftSettingsChanged() {
      void loadDefaultGrantDuration();
    }
    window.addEventListener("shift-status-changed", onShiftSettingsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("shift-status-changed", onShiftSettingsChanged);
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
    if (
      createRole !== "agent" &&
      createRole !== "supervisor" &&
      createRole !== "processor" &&
      createRole !== "lead_supervisor"
    ) {
      return;
    }
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
      };
      if (password) payload.password = password;
      if (role === "admin") {
        payload.role = createRole;
        if (
          createRole === "agent" ||
          createRole === "supervisor" ||
          createRole === "processor" ||
          createRole === "lead_supervisor"
        ) {
          payload.managerId = managerId ?? null;
        }
        if (createRole === "agent") payload.supervisorId = supervisorId ?? null;
        if (createRole !== "admin") {
          payload.shiftKey = createShiftKey === "night" ? "night" : "day";
          payload.isOutside = createIsOutside;
        }
        if (role === "admin" && createCanReceiveSharedLeads) {
          payload.canReceiveSharedLeads = true;
        }
        if (createRole === "agent" && createSelectsLeadSupervisor) {
          payload.selectsLeadSupervisor = true;
        }
      } else if (role === "manager") {
        payload.role = createRole;
        if (createRole === "agent" && supervisorId != null) {
          payload.supervisorId = supervisorId;
        }
        if (createRole === "agent" && createSelectsLeadSupervisor) {
          payload.selectsLeadSupervisor = true;
        }
        payload.shiftKey = createShiftKey === "night" ? "night" : "day";
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
      setCreateIsOutside(false);
      setCreateCanReceiveSharedLeads(false);
      setCreateSelectsLeadSupervisor(false);
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

  async function setLoginWindowExemptForUser(u, exempt) {
    if (u.role === "admin") return;
    setListError(null);
    setRowBusyId(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ loginWindowExempt: Boolean(exempt) }),
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
  const isSupervisor = isAgentSupervisorRole(role);
  const showRoleSelector = role === "admin" || isManager;
  const showManagerSelector =
    role === "admin" &&
    (createRole === "agent" ||
      createRole === "supervisor" ||
      createRole === "processor" ||
      createRole === "lead_supervisor");
  const showSupervisorSelector = (role === "admin" || isManager) && createRole === "agent";
  const listHeading =
    role === "admin" ? "All users" : isManager ? "Your team" : "Your agents";
  const listDescription =
    role === "admin"
      ? "Everyone in the system."
      : isManager
        ? "Day and night agents, supervisors, processors, and lead supervisors assigned to you."
        : isLeadSupervisor(role)
          ? "In-house agents on your shift."
          : "Agents assigned to you as their supervisor.";
  const showHierarchyColumns = !isSupervisor;
  const showLeaveColumn = true;
  const showShiftColumn = role === "admin" || isManager;
  const showAfterShiftColumn = role === "admin";
  const showWindowColumn = role === "admin";
  const filteredSupervisorOptions =
    managerId == null || managerId === ""
      ? supervisorOptions
      : supervisorOptions.filter((s) => Number(s.managerId) === Number(managerId));
  const visibleUsersCount = displayUsers.length;
  const visibleUsersOnLeaveCount = displayUsers.filter((u) => Boolean(u.currentLeave)).length;

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
                    ? " Choose a role and, for agents, supervisors, processors, or lead supervisors, optionally assign a manager. Password is optional for outside agents."
                    : isManager
                      ? " Create an agent, supervisor, processor, or lead supervisor under your team."
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
                  {createPasswordOptional ? (
                    <span className="font-normal text-zinc-500"> (optional)</span>
                  ) : null}
                </label>
                <input
                  id="new-user-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder={
                    createPasswordOptional
                      ? "Leave blank if they will not sign in"
                      : "Minimum length per your policy"
                  }
                  autoComplete="new-password"
                />
              </div>
            </div>

            {(showRoleSelector ||
              showManagerSelector ||
              showSupervisorSelector ||
              createRole !== "admin") && (
              <div
                className={`grid gap-5 ${
                  showRoleSelector || showManagerSelector || showSupervisorSelector
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
                          <option value="processor">Processor</option>
                          <option value="lead_supervisor">Lead Supervisor</option>
                          <option value="admin">Admin</option>
                        </>
                      ) : (
                        <>
                          <option value="supervisor">Supervisor</option>
                          <option value="processor">Processor</option>
                          <option value="lead_supervisor">Lead Supervisor</option>
                        </>
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
                          {supervisorSelectLabel(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {((role === "admin" && createRole !== "admin") ||
                  (role === "manager" && createRole !== "admin")) ? (
                  <div>
                    <label htmlFor="new-user-shift" className={labelClass}>
                      Shift
                    </label>
                    <select
                      id="new-user-shift"
                      className={inputClass}
                      value={createShiftKey}
                      onChange={(e) => setCreateShiftKey(e.target.value === "night" ? "night" : "day")}
                    >
                      <option value="day">Day (6:00 PM – 11:00 PM PKT)</option>
                      <option value="night">Night (1:00 AM – 6:00 AM PKT)</option>
                    </select>
                    {role === "manager" && createRole === "agent" && supervisorId != null ? (
                      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                        Agents assigned to a supervisor inherit that supervisor&apos;s shift.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {role === "admin" && createRole !== "admin" ? (
                  <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
                    <input
                      id="new-user-outside"
                      type="checkbox"
                      checked={createIsOutside}
                      onChange={(e) => setCreateIsOutside(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                    />
                    <label htmlFor="new-user-outside" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Outside staff
                      <span className="ml-1 font-normal text-zinc-500">
                        (can be assigned to outside customers)
                      </span>
                    </label>
                  </div>
                ) : null}
                {role === "admin" ? (
                  <div className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 dark:border-teal-800 dark:bg-teal-950/30">
                    <input
                      id="new-user-shared-view"
                      type="checkbox"
                      checked={createCanReceiveSharedLeads}
                      onChange={(e) => setCreateCanReceiveSharedLeads(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
                    />
                    <label htmlFor="new-user-shared-view" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Shared view access
                      <span className="ml-1 font-normal text-zinc-500">
                        (can receive view-only shared sales and see Shared with me)
                      </span>
                    </label>
                  </div>
                ) : null}
                {(role === "admin" || role === "manager") && createRole === "agent" ? (
                  <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-800 dark:bg-rose-950/30">
                    <input
                      id="new-user-selects-lead-supervisor"
                      type="checkbox"
                      checked={createSelectsLeadSupervisor}
                      onChange={(e) => setCreateSelectsLeadSupervisor(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-rose-600 focus:ring-rose-500"
                    />
                    <label
                      htmlFor="new-user-selects-lead-supervisor"
                      className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                    >
                      Agent selects lead supervisor
                      <span className="ml-1 font-normal text-zinc-500">
                        (do not auto-assign to linked supervisor)
                      </span>
                    </label>
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
              {visibleUsersOnLeaveCount > 0
                ? ` ${visibleUsersOnLeaveCount} currently on leave.`
                : null}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <StatusDot colorClass="bg-emerald-500" label="Online / active / lifted" />
                online · active · lifted
              </span>
              <span className="inline-flex items-center gap-1">
                <StatusDot colorClass="bg-amber-500" label="Away / on leave" />
                away · leave
              </span>
              <span className="inline-flex items-center gap-1">
                <StatusDot colorClass="bg-zinc-400" label="Offline / inactive / restricted" />
                offline · inactive · restricted
              </span>
              {showAfterShiftColumn ? (
                <span className="inline-flex items-center gap-1">
                  <StatusDot colorClass="bg-sky-500" label="Full after-shift" />
                  after-shift full
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-end justify-end gap-3">
            <div className="w-full min-w-0 sm:min-w-[12rem] sm:w-auto sm:max-w-[16rem]">
              <label htmlFor="users-name-search" className={compactFilterLabelClass}>
                Search name
              </label>
              <input
                id="users-name-search"
                type="search"
                className={compactFilterInputClass}
                value={listNameSearch}
                onChange={(e) => setListNameSearch(e.target.value)}
                placeholder="Display name or username…"
                aria-label="Search by display name or username"
                autoComplete="off"
              />
            </div>
            {role === "admin" || role === "manager" ? (
              <>
                <div className="w-full min-w-0 sm:min-w-[11rem] sm:w-auto">
                  <label htmlFor="users-shift-filter" className={compactFilterLabelClass}>
                    Shift
                  </label>
                  <select
                    id="users-shift-filter"
                    className={compactFilterSelectClass}
                    value={listShiftFilter}
                    onChange={(e) => {
                      setListShiftFilter(e.target.value);
                      setListSupervisorFilter("");
                    }}
                    aria-label="Filter by day or night shift"
                  >
                    <option value="all">Combined (all)</option>
                    <option value="day">Day shift</option>
                    <option value="night">Night shift</option>
                  </select>
                </div>
                <div className="w-full min-w-0 sm:min-w-[11rem] sm:w-auto">
                  <label htmlFor="users-outside-filter" className={compactFilterLabelClass}>
                    Outside
                  </label>
                  <select
                    id="users-outside-filter"
                    className={compactFilterSelectClass}
                    value={listOutsideFilter}
                    onChange={(e) => setListOutsideFilter(e.target.value)}
                    aria-label="Filter by outside staff"
                  >
                    <option value="all">Combined (all)</option>
                    <option value="outside">Outside</option>
                    <option value="inhouse">In-house</option>
                  </select>
                </div>
                <div className="w-full min-w-0 sm:min-w-[11rem] sm:w-auto">
                  <label htmlFor="users-active-filter" className={compactFilterLabelClass}>
                    Status
                  </label>
                  <select
                    id="users-active-filter"
                    className={compactFilterSelectClass}
                    value={listActiveFilter}
                    onChange={(e) => setListActiveFilter(e.target.value)}
                    aria-label="Filter by active status"
                  >
                    <option value="all">Combined (all)</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
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
                    {listSupervisorOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {supervisorSelectLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
                ) : null}
              </>
            ) : (
              <div className="w-full min-w-0 sm:min-w-[11rem] sm:w-auto">
                <label htmlFor="users-active-filter" className={compactFilterLabelClass}>
                  Status
                </label>
                <select
                  id="users-active-filter"
                  className={compactFilterSelectClass}
                  value={listActiveFilter}
                  onChange={(e) => setListActiveFilter(e.target.value)}
                  aria-label="Filter by active status"
                >
                  <option value="all">Combined (all)</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
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
                  : "Try a different name search, shift, outside, or status filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200/80 dark:border-zinc-700">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                    <th className="px-3 py-3">Username</th>
                    <th className="px-3 py-3">Role</th>
                    {showShiftColumn ? <th className="px-3 py-3">Shift</th> : null}
                    <th className="w-10 px-2 py-3 text-center" title="Presence">
                      Pr
                    </th>
                    <th className="px-3 py-3">Last active</th>
                    <th className="w-10 px-2 py-3 text-center" title="Account status">
                      Act
                    </th>
                    {showLeaveColumn ? (
                      <th className="w-10 px-2 py-3 text-center" title="Leave">
                        Lv
                      </th>
                    ) : null}
                    {showWindowColumn ? (
                      <th className="w-10 px-2 py-3 text-center" title="Login window">
                        Win
                      </th>
                    ) : null}
                    {showAfterShiftColumn ? (
                      <th className="w-10 px-2 py-3 text-center" title="After-shift access">
                        AS
                      </th>
                    ) : null}
                    {showHierarchyColumns ? (
                      <th className="px-3 py-3">Supervisor</th>
                    ) : null}
                    <th className="px-3 py-3 text-right">Actions</th>
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
                        <td className="px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                          <button
                            type="button"
                            onClick={() => setEditingUser(u)}
                            className="text-left font-medium text-emerald-700 hover:underline focus:underline focus:outline-none dark:text-emerald-300"
                            title="Edit user"
                          >
                            <UserNameLabel
                              displayName={u.displayName}
                              username={u.username}
                              displayClassName="text-base font-semibold text-emerald-700 dark:text-emerald-300"
                              usernameClassName="text-xs font-normal text-zinc-400 dark:text-zinc-500"
                            />
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <RoleBadge value={u.role} />
                          {u.isOutside ? (
                            <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                              Outside
                            </span>
                          ) : null}
                        </td>
                        {showShiftColumn ? (
                          <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300">
                            {u.role === "admin"
                              ? "—"
                              : u.shiftKey === "night"
                                ? "Night"
                                : "Day"}
                          </td>
                        ) : null}
                        <td className="px-2 py-2.5 text-center">
                          <span className="inline-flex justify-center">
                            <PresenceBadge status={u.presence} compact />
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-300">
                          {formatLastActive(u.lastActiveAt)}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className="inline-flex justify-center">
                            <ActiveBadge active={active} compact />
                          </span>
                        </td>
                        {showLeaveColumn ? (
                          <td className="px-2 py-2.5 text-center">
                            <span className="inline-flex justify-center">
                              <LeaveBadge leave={u.currentLeave} showDates={false} compact />
                            </span>
                          </td>
                        ) : null}
                        {showWindowColumn ? (
                          <td className="px-2 py-2.5 text-center">
                            <span className="inline-flex justify-center">
                              <LoginWindowBadge
                                exempt={Boolean(u.loginWindowExempt)}
                                role={u.role}
                                compact
                              />
                            </span>
                          </td>
                        ) : null}
                        {showAfterShiftColumn ? (
                          <td className="px-2 py-2.5 text-center">
                            <span className="inline-flex justify-center">
                              {u.role === "admin" ? (
                                <StatusDot colorClass="bg-sky-500" label="Always full access" />
                              ) : (
                                <AfterShiftAccessBadge
                                  access={u.afterShiftAccess || "none"}
                                  expiresAt={u.afterShiftAccessExpiresAt}
                                  grantDurationMinutes={
                                    u.afterShiftGrantDurationMinutes ?? defaultGrantDurationMinutes
                                  }
                                  isCustomGrantDuration={u.afterShiftGrantDurationMinutes != null}
                                  compact
                                />
                              )}
                            </span>
                          </td>
                        ) : null}
                        {showHierarchyColumns ? (
                          <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-300">
                            {u.role === "agent"
                              ? users.find((x) => x.id === u.supervisorId)?.username ??
                                u.supervisorId ??
                                "—"
                              : "—"}
                          </td>
                        ) : null}
                        <td className="px-3 py-2.5 text-right">
                          <UserRowActionsMenu
                            user={u}
                            active={active}
                            isSelf={u.id === currentUserId}
                            busy={rowBusyId === u.id}
                            isAdmin={role === "admin"}
                            onEdit={() => setEditingUser(u)}
                            onMessage={() => startCompose(u.id)}
                            onDeactivate={() => toggleActive(u, false)}
                            onActivate={() => toggleActive(u, true)}
                            onGrantAfterShift={() => setAfterShiftAccessForUser(u, "full")}
                            onRevokeAfterShift={() => setAfterShiftAccessForUser(u, "none")}
                            onLiftWindowRestriction={() => setLoginWindowExemptForUser(u, true)}
                            onAddWindowRestriction={() => setLoginWindowExemptForUser(u, false)}
                            onMarkLeave={() => setEditingUser(u)}
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
