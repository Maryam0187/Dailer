"use client";

import { useEffect, useMemo, useState } from "react";

function roleLabel(role) {
  if (role === "agent") return "Agent";
  if (role === "manager") return "Manager";
  if (role === "admin") return "Admin";
  return role;
}

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-emerald-400/70 dark:focus:ring-emerald-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

function RoleBadge({ value }) {
  const styles = {
    admin: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200",
    manager: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
    agent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
  };
  const palette =
    value === "admin" || value === "manager" || value === "agent"
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

function EditUserModal({
  user,
  onClose,
  role: viewerRole,
  managers,
  currentUserId,
  onSaved,
}) {
  const isAdmin = viewerRole === "admin";
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState("");
  const [editRole, setEditRole] = useState(user.role);
  const [managerId, setManagerId] = useState(user.managerId ?? "");
  const [isActive, setIsActive] = useState(user.isActive !== false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setUsername(user.username);
    setPassword("");
    setEditRole(user.role);
    setManagerId(user.managerId ?? "");
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
            const mid = managerId === "" || managerId == null ? NaN : Number(managerId);
            if (!mid || Number.isNaN(mid)) {
              throw new Error("Select a manager for this agent");
            }
            payload.managerId = mid;
          }
        } else if (editRole === "agent") {
          const mid = managerId === "" || managerId == null ? NaN : Number(managerId);
          const prev = user.managerId != null ? Number(user.managerId) : null;
          if (mid !== prev) {
            if (!mid || Number.isNaN(mid)) {
              throw new Error("Select a manager for this agent");
            }
            payload.managerId = mid;
          }
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

  const showManager = isAdmin && editRole === "agent";

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
                  <option value="admin">Admin</option>
                </select>
              </div>
              {showManager ? (
                <div>
                  <label htmlFor="edit-manager" className={labelClass}>
                    Manager
                  </label>
                  <select
                    id="edit-manager"
                    className={inputClass}
                    value={managerId === null || managerId === undefined ? "" : String(managerId)}
                    onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : "")}
                  >
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

export default function UsersClient({ role, managers, initialUsers, currentUserId }) {
  const [users, setUsers] = useState(initialUsers ?? []);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [createRole, setCreateRole] = useState(role === "admin" ? "agent" : "agent");
  const [managerId, setManagerId] = useState(managers[0]?.id ?? null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [editingUser, setEditingUser] = useState(null);
  const [rowBusyId, setRowBusyId] = useState(null);
  const [listError, setListError] = useState(null);

  const managerMap = useMemo(() => {
    const map = new Map();
    for (const m of managers) map.set(m.id, m.username);
    return map;
  }, [managers]);

  async function loadUsers() {
    const res = await fetch("/api/users", { credentials: "include" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Failed to load users");
    const list = json.users || [];
    setUsers(
      list.map((u) => ({
        ...u,
        isActive: u.isActive !== false && u.isActive !== 0,
      })),
    );
  }

  useEffect(() => {
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

  const showRoleSelector = role === "admin";
  const showManagerSelector = role === "admin" && createRole === "agent";

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      {editingUser ? (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          role={role}
          managers={managers}
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
                  {showRoleSelector
                    ? " Choose a role and, for agents, assign a manager."
                    : " New users are added as agents under you."}
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

            {(showRoleSelector || showManagerSelector) && (
              <div
                className={`grid gap-5 ${showRoleSelector && showManagerSelector ? "sm:grid-cols-2" : ""}`}
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
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                ) : null}

                {showManagerSelector ? (
                  <div>
                    <label htmlFor="new-user-manager" className={labelClass}>
                      Assign manager
                    </label>
                    <select
                      id="new-user-manager"
                      className={inputClass}
                      value={managerId ?? ""}
                      onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : null)}
                    >
                      {managers.length === 0 ? (
                        <option value="">No managers available</option>
                      ) : null}
                      {managers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.username}
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
                  loading || (role === "admin" && createRole === "agent" && !managerId)
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
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {role === "admin" ? "All users" : "Your agents"}
          </h2>
          <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
            {users.length === 0
              ? "No accounts yet."
              : `${users.length} ${users.length === 1 ? "person" : "people"} in this list.`}
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
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Manager</th>
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
                          {u.username}
                        </td>
                        <td className="px-4 py-3.5">
                          <RoleBadge value={u.role} />
                        </td>
                        <td className="px-4 py-3.5">
                          <ActiveBadge active={active} />
                        </td>
                        <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300">
                          {u.role === "agent" ? managerMap.get(u.managerId) ?? u.managerId : "—"}
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-zinc-600 dark:text-zinc-300">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingUser(u)}
                              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                              Edit
                            </button>
                            {u.id !== currentUserId ? (
                              active ? (
                                <button
                                  type="button"
                                  disabled={rowBusyId === u.id}
                                  onClick={() => toggleActive(u, false)}
                                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
                                >
                                  {rowBusyId === u.id ? "…" : "Deactivate"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={rowBusyId === u.id}
                                  onClick={() => toggleActive(u, true)}
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60"
                                >
                                  {rowBusyId === u.id ? "…" : "Activate"}
                                </button>
                              )
                            ) : null}
                          </div>
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
