"use client";

import { useEffect, useMemo, useState } from "react";

function toQueryParams({ view, agentId, managerId, includeManagerCalls }) {
  const params = new URLSearchParams();
  params.set("view", view);
  if (agentId !== undefined && agentId !== null) params.set("agentId", String(agentId));
  if (managerId !== undefined && managerId !== null) params.set("managerId", String(managerId));
  if (view === "manager") params.set("includeManagerCalls", includeManagerCalls ? "true" : "false");
  return params.toString();
}

export default function CallLogsClient({ role, agents, managers, defaultManagerId }) {
  const [view, setView] = useState("mine");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? null);
  const [managerId, setManagerId] = useState(managers[0]?.id ?? defaultManagerId);
  const [includeManagerCalls, setIncludeManagerCalls] = useState(false);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const agentOptions = useMemo(() => agents ?? [], [agents]);
  const managerOptions = useMemo(() => managers ?? [], [managers]);

  // Ensure defaults when data changes (first load, role-specific lists).
  useEffect(() => {
    if (role === "admin") {
      setAgentId((prev) => prev ?? agents[0]?.id ?? null);
      setManagerId((prev) => prev ?? managers[0]?.id ?? defaultManagerId);
    } else if (role === "manager") {
      setAgentId((prev) => prev ?? agents[0]?.id ?? null);
      setManagerId(defaultManagerId);
      setIncludeManagerCalls(false);
    } else {
      setView("mine");
      setIncludeManagerCalls(false);
    }
  }, [role, agents, managers, defaultManagerId]);

  useEffect(() => {
    // Agents can only view their own logs; also avoid calling API with missing ids.
    if (role === "agent" && view !== "mine") setView("mine");

    if (view === "agent" && !agentId) return;
    if (view === "manager" && !managerId) return;

    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const query = toQueryParams({ view, agentId, managerId, includeManagerCalls });
        const res = await fetch(`/api/calls?${query}`, {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to fetch call logs");
        setCalls(json.calls || []);
      } catch (e) {
        if (e.name === "AbortError") return;
        setError(e.message || "Failed to fetch call logs");
        setCalls([]);
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [role, view, agentId, managerId, includeManagerCalls]);

  const canViewAgent = role === "admin" || role === "manager";

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/60 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-950 dark:text-zinc-100">
            View
          </label>
          <select
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            value={view}
            onChange={(e) => setView(e.target.value)}
            disabled={role === "agent"}
          >
            <option value="mine">Mine</option>
            {role === "admin" ? <option value="all_agents">All agents</option> : null}
            {role === "manager" ? <option value="all_my_agents">All my agents</option> : null}
            {canViewAgent ? <option value="agent">Specific agent</option> : null}
            {role === "admin" ? <option value="manager">Filter by manager</option> : null}
          </select>
        </div>

        <div className="flex flex-col gap-2 md:min-w-[320px]">
          {view === "agent" ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-950 dark:text-zinc-100">
                Agent
              </label>
              <select
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                value={agentId ?? ""}
                onChange={(e) => setAgentId(e.target.value ? Number(e.target.value) : null)}
              >
                {agentOptions.length === 0 ? (
                  <option value="">No agents available</option>
                ) : (
                  agentOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.username}
                    </option>
                  ))
                )}
              </select>
            </div>
          ) : null}

          {view === "manager" && role === "admin" ? (
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-950 dark:text-zinc-100">
                  Manager
                </label>
                <select
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  value={managerId ?? ""}
                  onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : null)}
                >
                  {managerOptions.length === 0 ? (
                    <option value="">No managers available</option>
                  ) : (
                    managerOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.username}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={includeManagerCalls}
                  onChange={(e) => setIncludeManagerCalls(e.target.checked)}
                />
                Include manager&apos;s own calls
              </label>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading...</p>
        ) : error ? (
          <p className="text-sm font-medium text-red-600">{error}</p>
        ) : calls.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            No calls found for this view.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">From</th>
                  <th className="py-2 pr-3">To</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Duration</th>
                  <th className="py-2">Caller</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                      {new Date(c.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                      {c.fromNumber || "—"}
                    </td>
                    <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-100">
                      {c.toNumber}
                    </td>
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">{c.status}</td>
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                      {c.durationSeconds ?? "—"}s
                    </td>
                    <td className="py-2 text-zinc-700 dark:text-zinc-200">{c.userId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

