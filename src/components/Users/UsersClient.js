"use client";

import { useEffect, useMemo, useState } from "react";

function roleLabel(role) {
  if (role === "agent") return "Agent";
  if (role === "manager") return "Manager";
  if (role === "admin") return "Admin";
  return role;
}

export default function UsersClient({ role, managers, initialUsers }) {
  const [users, setUsers] = useState(initialUsers ?? []);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [createRole, setCreateRole] = useState(role === "admin" ? "agent" : "agent");
  const [managerId, setManagerId] = useState(managers[0]?.id ?? null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const managerMap = useMemo(() => {
    const map = new Map();
    for (const m of managers) map.set(m.id, m.username);
    return map;
  }, [managers]);

  async function loadUsers() {
    const res = await fetch("/api/users", { credentials: "include" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Failed to load users");
    setUsers(json.users || []);
  }

  useEffect(() => {
    // Keep managerId in sync if manager list changes.
    if (createRole === "agent" && !managerId) {
      setManagerId(managers[0]?.id ?? null);
    }
  }, [managers, createRole, managerId]);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        username,
        password,
        role: createRole,
      };
      if (createRole === "agent") payload.managerId = managerId;

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

  const showRoleSelector = role === "admin";
  const showManagerSelector = role === "admin" && createRole === "agent";

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/60 dark:bg-zinc-900 dark:ring-zinc-800">
        <h2 className="mb-3 text-lg font-medium text-zinc-950 dark:text-zinc-100">
          Add user
        </h2>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              autoComplete="new-username"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              autoComplete="new-password"
            />
          </div>

          {showRoleSelector ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Role
              </label>
              <select
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value)}
              >
                <option value="agent">Agent</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          ) : null}

          {showManagerSelector ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Assign manager
              </label>
              <select
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                value={managerId ?? ""}
                onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : null)}
              >
                {managers.length === 0 ? <option value="">No managers available</option> : null}
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.username}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm font-medium text-red-600">{error}</p>
          ) : null}

          <button
            disabled={
              loading || (role === "admin" && createRole === "agent" && !managerId)
            }
            className="h-10 rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-white"
          >
            {loading ? "Creating..." : "Create"}
          </button>
        </form>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/60 dark:bg-zinc-900 dark:ring-zinc-800">
        <h2 className="mb-3 text-lg font-medium text-zinc-950 dark:text-zinc-100">
          {role === "admin" ? "All users" : "Your agents"}
        </h2>

        {users.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="py-2 pr-3">Username</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Manager</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-100">{u.username}</td>
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">{roleLabel(u.role)}</td>
                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                      {u.role === "agent" ? managerMap.get(u.managerId) ?? u.managerId : "—"}
                    </td>
                    <td className="py-2 text-zinc-700 dark:text-zinc-200">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    </td>
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

