"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { io as ioClient } from "socket.io-client";
import { formatDuration } from "@/lib/formatDuration";
import { normalizePresence, PresenceDot, UserAvatar } from "@/components/Messaging/presence";
import UserNameLabel from "@/components/UserNameLabel";

const POLL_MS = 8_000;

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "onCall", label: "On call" },
  { id: "online", label: "Online" },
  { id: "available", label: "Available" },
  { id: "away", label: "Away" },
  { id: "offline", label: "Offline" },
];

const SHIFT_FILTERS = [
  { id: "all", label: "All shifts" },
  { id: "day", label: "Day" },
  { id: "night", label: "Night" },
];

const LOCATION_FILTERS = [
  { id: "all", label: "All locations" },
  { id: "in_house", label: "In-house" },
  { id: "outside", label: "Outside" },
];

const selectClass =
  "h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:ring-sky-900/40";

const pillActive = "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900";
const pillIdle =
  "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800";

function roleLabel(role) {
  if (role === "agent") return "Agent";
  if (role === "manager") return "Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "lead_supervisor") return "Lead supervisor";
  if (role === "processor") return "Processor";
  if (role === "admin") return "Admin";
  return String(role || "").replace(/_/g, " ");
}

function formatRelative(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 0) return date.toLocaleString();
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function callStatusLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "in-progress" || s === "answered") return "In call";
  if (s === "ringing") return "Ringing";
  if (s === "queued" || s === "initiated") return "Connecting";
  return s || "Active";
}

function formatLeaveRange(leave) {
  if (!leave?.startDate || !leave?.endDate) return "On leave";
  if (leave.startDate === leave.endDate) return leave.startDate;
  return `${leave.startDate} – ${leave.endDate}`;
}

function buildSummary(agents) {
  const summary = {
    total: agents.length,
    online: 0,
    away: 0,
    offline: 0,
    onCall: 0,
    available: 0,
    onLeave: 0,
  };
  for (const a of agents) {
    if (a.presence === "online") summary.online += 1;
    else if (a.presence === "away") summary.away += 1;
    else summary.offline += 1;
    if (a.onCall) summary.onCall += 1;
    else if (a.presence === "online") summary.available += 1;
    if (a.isOnLeave) summary.onLeave += 1;
  }
  return summary;
}

function sortAgents(list) {
  return [...list].sort((a, b) => {
    const rank = (agent) => {
      if (agent.onCall) return 0;
      if (agent.presence === "online") return 1;
      if (agent.presence === "away") return 2;
      return 3;
    };
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return (a.username || "").localeCompare(b.username || "");
  });
}

/** Shift / location — drives summary tiles. */
function matchesTileScope(agent, { shiftFilter, locationFilter }) {
  if (shiftFilter === "day" && agent.shiftKey !== "day") return false;
  if (shiftFilter === "night" && agent.shiftKey !== "night") return false;
  if (locationFilter === "outside" && !agent.isOutside) return false;
  if (locationFilter === "in_house" && agent.isOutside) return false;
  return true;
}

function matchesListExtras(agent, { managerFilter, query }) {
  if (managerFilter === "none") {
    if (agent.managerId != null) return false;
  } else if (managerFilter !== "all") {
    if (Number(agent.managerId) !== Number(managerFilter)) return false;
  }
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    agent.username,
    agent.displayName,
    agent.role,
    agent.managerUsername,
    agent.managerDisplayName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function matchesStatus(agent, statusFilter) {
  if (statusFilter === "onCall") return Boolean(agent.onCall);
  if (statusFilter === "online") return agent.presence === "online";
  if (statusFilter === "away") return agent.presence === "away";
  if (statusFilter === "offline") return agent.presence === "offline";
  if (statusFilter === "available") return agent.presence === "online" && !agent.onCall;
  return true;
}

function SummaryCard({ label, value, tone = "zinc", hint }) {
  const tones = {
    zinc: "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
    emerald:
      "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/30",
    sky: "border-sky-200/80 bg-sky-50/80 dark:border-sky-900/50 dark:bg-sky-950/30",
    amber: "border-amber-200/80 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30",
    rose: "border-rose-200/80 bg-rose-50/80 dark:border-rose-900/50 dark:bg-rose-950/30",
    violet:
      "border-violet-200/80 bg-violet-50/80 dark:border-violet-900/50 dark:bg-violet-950/30",
  };
  const valueTone = {
    zinc: "text-zinc-950 dark:text-zinc-50",
    emerald: "text-emerald-800 dark:text-emerald-200",
    sky: "text-sky-800 dark:text-sky-200",
    amber: "text-amber-900 dark:text-amber-200",
    rose: "text-rose-800 dark:text-rose-200",
    violet: "text-violet-800 dark:text-violet-200",
  };
  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-sm ${tones[tone] || tones.zinc}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${valueTone[tone] || valueTone.zinc}`}>
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      ) : null}
    </div>
  );
}

function OnCallBadge({ call }) {
  if (!call) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
      </span>
      {callStatusLabel(call.status)}
      {call.invited ? " · invited" : ""}
    </span>
  );
}

function LeaveBadge({ leave }) {
  if (!leave) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
      title={leave.reason ? String(leave.reason) : formatLeaveRange(leave)}
    >
      On leave
      <span className="font-normal text-amber-700/80 dark:text-amber-300/80">
        {formatLeaveRange(leave)}
      </span>
    </span>
  );
}

function AgentRow({ agent }) {
  const name = agent.displayName || agent.username;
  const call = agent.activeCall;

  return (
    <li
      className={`flex flex-col gap-3 border-b border-zinc-100 px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 dark:border-zinc-800/80 ${
        agent.onCall ? "bg-rose-50/40 dark:bg-rose-950/20" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar name={name} presence={agent.presence} size="md" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <UserNameLabel
              displayName={agent.displayName}
              username={agent.username}
              displayClassName="text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-50"
            />
            {agent.onCall ? <OnCallBadge call={call} /> : null}
            {agent.isOnLeave ? <LeaveBadge leave={agent.currentLeave} /> : null}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {roleLabel(agent.role)}
            {" · "}
            {agent.shiftKey === "night" ? "Night" : "Day"} shift
            {agent.isOutside ? " · Outside" : " · In-house"}
            {agent.managerUsername
              ? ` · Mgr ${agent.managerDisplayName || agent.managerUsername}`
              : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm sm:flex sm:shrink-0 sm:items-center sm:gap-6">
        <div className="min-w-[7rem]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Status</p>
          <div className="mt-0.5">
            <PresenceDot status={agent.presence} showLabel />
          </div>
        </div>

        <div className="min-w-[9rem]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Current call
          </p>
          {call ? (
            <div className="mt-0.5">
              <p className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                {call.direction === "inbound" ? call.fromNumber : call.toNumber || "—"}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {formatDuration(call.durationSeconds)}
                {call.dialerIndex === 2 ? " · Line 2" : ""}
              </p>
            </div>
          ) : (
            <p className="mt-0.5 text-zinc-400 dark:text-zinc-500">—</p>
          )}
        </div>

        <div className="min-w-[7rem]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Last call
          </p>
          <p
            className="mt-0.5 text-zinc-700 dark:text-zinc-300"
            title={agent.lastCallAt ? new Date(agent.lastCallAt).toLocaleString() : undefined}
          >
            {formatRelative(agent.lastCallAt)}
          </p>
        </div>

        <div className="min-w-[7rem]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Last active
          </p>
          <p
            className="mt-0.5 text-zinc-700 dark:text-zinc-300"
            title={agent.lastActiveAt ? new Date(agent.lastActiveAt).toLocaleString() : undefined}
          >
            {formatRelative(agent.lastActiveAt)}
          </p>
        </div>
      </div>
    </li>
  );
}

export default function LiveStatusClient({
  initialAgents = [],
  initialManagers = [],
  viewerRole = "admin",
}) {
  const isAdmin = viewerRole === "admin";
  const [agents, setAgents] = useState(() => sortAgents(initialAgents));
  const [managers, setManagers] = useState(initialManagers);
  const [statusFilter, setStatusFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date());
  const [error, setError] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch("/api/live-status", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to refresh");
      setAgents(sortAgents(json.agents || []));
      if (isAdmin && Array.isArray(json.managers)) setManagers(json.managers);
      setLastUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      setError(err?.message || "Failed to refresh");
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    const socket = ioClient({
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socket.on("presence:update", (payload) => {
      const userId = Number(payload?.userId);
      if (!Number.isInteger(userId) || userId <= 0) return;
      const nextPresence = normalizePresence(payload?.presence);
      const lastActiveAt = payload?.lastActiveAt ?? null;
      setAgents((prev) =>
        sortAgents(
          prev.map((u) => {
            if (Number(u.id) !== userId) return u;
            return {
              ...u,
              presence: nextPresence,
              lastActiveAt: lastActiveAt ?? u.lastActiveAt ?? null,
            };
          }),
        ),
      );
    });

    socket.on("presence:sync", () => {
      void load({ silent: true });
    });

    return () => {
      socket.disconnect();
    };
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      void load({ silent: true });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const tileScope = useMemo(
    () => ({ shiftFilter, locationFilter }),
    [shiftFilter, locationFilter],
  );

  const tileAgents = useMemo(
    () => agents.filter((a) => matchesTileScope(a, tileScope)),
    [agents, tileScope],
  );

  const summary = useMemo(() => buildSummary(tileAgents), [tileAgents]);

  const filtered = useMemo(
    () =>
      tileAgents.filter(
        (a) =>
          matchesListExtras(a, { managerFilter, query }) && matchesStatus(a, statusFilter),
      ),
    [tileAgents, managerFilter, query, statusFilter],
  );

  const activeScopeHints = [];
  if (shiftFilter !== "all") activeScopeHints.push(shiftFilter);
  if (locationFilter === "outside") activeScopeHints.push("outside");
  if (locationFilter === "in_house") activeScopeHints.push("in-house");
  if (managerFilter === "none") activeScopeHints.push("no manager");
  else if (managerFilter !== "all") {
    const m = managers.find((x) => Number(x.id) === Number(managerFilter));
    activeScopeHints.push(m ? `mgr ${m.displayName || m.username}` : `mgr #${managerFilter}`);
  }
  if (statusFilter !== "all") activeScopeHints.push(statusFilter);
  if (query.trim()) activeScopeHints.push(`“${query.trim()}”`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5">
        {SHIFT_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setShiftFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              shiftFilter === f.id ? pillActive : pillIdle
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="mx-1 hidden h-6 w-px self-center bg-zinc-200 sm:inline-block dark:bg-zinc-700" />
        {LOCATION_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setLocationFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              locationFilter === f.id ? pillActive : pillIdle
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        <SummaryCard label="Team" value={summary.total} tone="zinc" />
        <SummaryCard label="Online" value={summary.online} tone="emerald" hint="Connected now" />
        <SummaryCard label="On call" value={summary.onCall} tone="rose" hint="Live phone legs" />
        <SummaryCard
          label="Available"
          value={summary.available}
          tone="sky"
          hint="Online, not on a call"
        />
        <SummaryCard label="Away" value={summary.away} tone="amber" />
        <SummaryCard label="Offline" value={summary.offline} tone="zinc" />
        <SummaryCard
          label="On leave"
          value={summary.onLeave}
          tone="violet"
          hint="Approved leave today"
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === f.id ? pillActive : pillIdle
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? (
              <>
                <label className="sr-only" htmlFor="live-status-manager">
                  Manager
                </label>
                <select
                  id="live-status-manager"
                  value={managerFilter}
                  onChange={(e) => setManagerFilter(e.target.value)}
                  className={selectClass}
                >
                  <option value="all">All managers</option>
                  <option value="none">No manager</option>
                  {managers.map((m) => (
                    <option key={m.id} value={String(m.id)}>
                      {m.displayName ? `${m.displayName} (@${m.username})` : m.username}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents…"
              className="h-9 w-full min-w-[12rem] rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200 sm:w-56 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-sky-900/40"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={refreshing}
              className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Updated {formatRelative(lastUpdatedAt)}
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div>
            <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">Agents</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Showing {filtered.length} of {tileAgents.length}
              {activeScopeHints.length > 0 ? ` · ${activeScopeHints.join(" · ")}` : ""}
            </p>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No agents match this view.
          </p>
        ) : (
          <ul>
            {filtered.map((agent) => (
              <AgentRow key={agent.id} agent={agent} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
