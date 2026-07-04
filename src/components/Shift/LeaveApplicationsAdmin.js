"use client";

import { useCallback, useEffect, useState } from "react";

function formatDateRange(startDate, endDate) {
  if (startDate === endDate) return startDate;
  return `${startDate} – ${endDate}`;
}

export default function LeaveApplicationsAdmin() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leave-applications", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load leave applications");
      setApplications(json.applications || []);
    } catch (err) {
      setError(err.message || "Failed to load leave applications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-4xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Leave applications</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        All submitted leave requests. Leave blocks agent sign-in on those dates.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-zinc-500">Loading…</p>
      ) : error ? (
        <p className="mt-4 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
      ) : applications.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No leave applications yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                <th className="px-2 py-2 font-semibold">User</th>
                <th className="px-2 py-2 font-semibold">Dates</th>
                <th className="px-2 py-2 font-semibold">Reason</th>
                <th className="px-2 py-2 font-semibold">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="px-2 py-2 font-medium text-zinc-900 dark:text-zinc-100">{app.username}</td>
                  <td className="px-2 py-2 text-zinc-700 dark:text-zinc-300">
                    {formatDateRange(app.startDate, app.endDate)}
                  </td>
                  <td className="px-2 py-2 text-zinc-600 dark:text-zinc-400">{app.reason || "—"}</td>
                  <td className="px-2 py-2 text-zinc-600 dark:text-zinc-400">
                    {app.createdAt ? new Date(app.createdAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
