"use client";

import { useCallback, useEffect, useState } from "react";

function formatDateRange(startDate, endDate) {
  if (startDate === endDate) return startDate;
  return `${startDate} – ${endDate}`;
}

function CancelConfirmDialog({ username, dateRange, cancelling, onConfirm, onClose }) {
  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-zinc-950/50 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-cancel-leave-title"
          className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
            <h3 id="admin-cancel-leave-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Cancel leave application?
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Cancel leave for <span className="font-medium text-zinc-800 dark:text-zinc-200">{username}</span>
              {dateRange ? (
                <>
                  {" "}
                  ({dateRange})
                </>
              ) : null}
              ? The record will remain as cancelled.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={cancelling}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Keep leave
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={cancelling}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Yes, cancel"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function LeaveApplicationsAdmin() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

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

  async function confirmCancelApplication() {
    if (!cancelTarget) return;

    const appId = cancelTarget.id;
    setBusyId(appId);
    setError(null);

    try {
      const res = await fetch(`/api/leave-applications/${appId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to cancel application");

      setCancelTarget(null);
      await load();
    } catch (err) {
      setError(err.message || "Failed to cancel application");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {cancelTarget ? (
        <CancelConfirmDialog
          username={cancelTarget.username}
          dateRange={formatDateRange(cancelTarget.startDate, cancelTarget.endDate)}
          cancelling={busyId === cancelTarget.id}
          onConfirm={() => void confirmCancelApplication()}
          onClose={() => {
            if (busyId !== cancelTarget.id) setCancelTarget(null);
          }}
        />
      ) : null}

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
                  <th className="px-2 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr
                    key={app.id}
                    className={`border-b border-zinc-100 dark:border-zinc-800 ${
                      app.status === "cancelled" ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-2 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {app.username}
                      {app.status === "cancelled" ? (
                        <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                          Cancelled
                        </span>
                      ) : app.cancelRequested ? (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                          Cancel requested
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-zinc-700 dark:text-zinc-300">
                      {formatDateRange(app.startDate, app.endDate)}
                    </td>
                    <td className="px-2 py-2 text-zinc-600 dark:text-zinc-400">{app.reason || "—"}</td>
                    <td className="px-2 py-2 text-zinc-600 dark:text-zinc-400">
                      {app.createdAt ? new Date(app.createdAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-2 py-2">
                      {app.canCancel ? (
                        <button
                          type="button"
                          disabled={busyId === app.id}
                          onClick={() => setCancelTarget(app)}
                          className="rounded-lg border border-rose-300 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950"
                        >
                          Cancel
                        </button>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
