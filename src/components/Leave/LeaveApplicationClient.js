"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "h-11 w-full rounded-lg border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-red-600/20";

const labelClass = "mb-1.5 block text-sm font-medium text-zinc-800";

function todayIsoDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatDateRange(startDate, endDate) {
  if (startDate === endDate) return startDate;
  return `${startDate} – ${endDate}`;
}

function RequestCancelDialog({ dateRange, requesting, onConfirm, onClose }) {
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
          aria-labelledby="request-cancel-leave-title"
          className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        >
          <div className="border-b border-zinc-200 px-5 py-4">
            <h3 id="request-cancel-leave-title" className="text-base font-semibold text-zinc-900">
              Request cancellation?
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              Send a cancellation request to admin
              {dateRange ? (
                <>
                  {" "}
                  for <span className="font-medium text-zinc-800">{dateRange}</span>
                </>
              ) : null}
              . An admin will review and cancel the leave if approved.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={requesting}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Keep leave
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={requesting}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {requesting ? "Sending…" : "Send request"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function LeaveApplicationClient({ username }) {
  const router = useRouter();
  const today = todayIsoDate();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editReason, setEditReason] = useState("");
  const [savingEditId, setSavingEditId] = useState(null);
  const [requestingCancelId, setRequestingCancelId] = useState(null);
  const [requestCancelTarget, setRequestCancelTarget] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  async function loadApplications() {
    setLoading(true);
    try {
      const res = await fetch("/api/leave-applications", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load applications");
      setApplications(json.applications || []);
    } catch (err) {
      setError(err.message || "Failed to load applications");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadApplications();
  }, []);

  function resetNewForm() {
    setStartDate("");
    setEndDate("");
    setReason("");
  }

  function startEdit(app) {
    setEditingId(app.id);
    setEditReason(app.reason || "");
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditReason("");
    setError(null);
    setSuccess(null);
  }

  async function onSubmitNew(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/leave-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ startDate, endDate, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to submit leave application");

      setSuccess("Leave application submitted.");
      resetNewForm();
      await loadApplications();
    } catch (err) {
      setError(err.message || "Failed to submit leave application");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveReason(appId) {
    setError(null);
    setSuccess(null);
    setSavingEditId(appId);

    try {
      const res = await fetch(`/api/leave-applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: editReason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to update reason");

      setSuccess("Reason updated.");
      cancelEdit();
      await loadApplications();
    } catch (err) {
      setError(err.message || "Failed to update reason");
    } finally {
      setSavingEditId(null);
    }
  }

  async function confirmRequestCancellation() {
    if (!requestCancelTarget) return;

    const appId = requestCancelTarget.id;
    setError(null);
    setSuccess(null);
    setRequestingCancelId(appId);

    try {
      const res = await fetch(`/api/leave-applications/${appId}/request-cancel`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to send cancellation request");

      setRequestCancelTarget(null);
      setSuccess("Cancellation request sent to admin.");
      await loadApplications();
    } catch (err) {
      setError(err.message || "Failed to send cancellation request");
    } finally {
      setRequestingCancelId(null);
    }
  }

  async function onLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      router.push("/sign-in?mode=leave");
    } catch {
      router.push("/sign-in?mode=leave");
    }
  }

  return (
    <>
      {requestCancelTarget ? (
        <RequestCancelDialog
          dateRange={formatDateRange(requestCancelTarget.startDate, requestCancelTarget.endDate)}
          requesting={requestingCancelId === requestCancelTarget.id}
          onConfirm={() => void confirmRequestCancellation()}
          onClose={() => {
            if (requestingCancelId !== requestCancelTarget.id) setRequestCancelTarget(null);
          }}
        />
      ) : null}

    <div className="relative flex min-h-dvh w-full flex-col bg-gradient-to-b from-zinc-100 via-zinc-50 to-white">
      <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10 sm:py-14">
        <div className="rounded-2xl border border-zinc-200/90 bg-white/90 p-8 shadow-lg shadow-zinc-200/50 ring-1 ring-zinc-950/5 backdrop-blur-sm">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Leave application</h1>
              <p className="mt-1.5 text-sm text-zinc-600">
                Signed in as <span className="font-medium text-zinc-900">{username}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => void onLogout()}
              disabled={loggingOut}
              className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
            >
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>

          <p className="mb-6 text-sm text-zinc-600">
            Apply for leave on specific dates. Leave blocks sign-in on those dates. Request cancellation and an admin will review it.
          </p>

          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          {success ? (
            <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800" role="status">
              {success}
            </p>
          ) : null}

          <form onSubmit={onSubmitNew} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="leave-start-date">
                  From
                </label>
                <input
                  id="leave-start-date"
                  type="date"
                  className={inputClass}
                  value={startDate}
                  min={today}
                  onChange={(e) => {
                    const next = e.target.value;
                    setStartDate(next);
                    if (endDate && next && endDate < next) setEndDate(next);
                  }}
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="leave-end-date">
                  To
                </label>
                <input
                  id="leave-end-date"
                  type="date"
                  className={inputClass}
                  value={endDate}
                  min={startDate && startDate > today ? startDate : today}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="leave-reason">
                Reason (optional)
              </label>
              <textarea
                id="leave-reason"
                className={`${inputClass} min-h-24 py-2.5`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Brief reason for leave"
                maxLength={1000}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="h-11 w-full rounded-lg bg-zinc-950 px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit leave application"}
            </button>
          </form>

          <div className="mt-8 border-t border-zinc-200 pt-6">
            <h2 className="text-sm font-semibold text-zinc-900">Your applications</h2>
            {loading ? (
              <p className="mt-3 text-sm text-zinc-500">Loading…</p>
            ) : applications.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No leave applications yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {applications.map((app) => (
                  <li
                    key={app.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      app.status === "cancelled"
                        ? "border-zinc-200 bg-zinc-100 text-zinc-500"
                        : "border-zinc-200 bg-zinc-50 text-zinc-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{formatDateRange(app.startDate, app.endDate)}</p>
                        {editingId === app.id ? (
                          <div className="mt-2 space-y-2">
                            <label className="block text-xs font-medium text-zinc-600" htmlFor={`edit-reason-${app.id}`}>
                              Reason
                            </label>
                            <textarea
                              id={`edit-reason-${app.id}`}
                              className={`${inputClass} min-h-20 py-2.5 text-sm`}
                              value={editReason}
                              onChange={(e) => setEditReason(e.target.value)}
                              maxLength={1000}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void saveReason(app.id)}
                                disabled={savingEditId === app.id}
                                className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                              >
                                {savingEditId === app.id ? "Saving…" : "Save reason"}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-white"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : app.reason ? (
                          <p className="mt-0.5 text-zinc-600">{app.reason}</p>
                        ) : (
                          <p className="mt-0.5 text-zinc-400">No reason provided</p>
                        )}
                      </div>
                      {app.status === "cancelled" ? (
                        <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                          Cancelled
                        </span>
                      ) : app.cancelRequested ? (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          Cancel requested
                        </span>
                      ) : null}
                    </div>
                    {editingId !== app.id && (app.canEdit || app.canRequestCancel) ? (
                      <div className="mt-2 flex gap-3">
                        {app.canEdit ? (
                          <button
                            type="button"
                            onClick={() => startEdit(app)}
                            className="text-sm font-semibold text-sky-700 hover:text-sky-900"
                          >
                            Edit reason
                          </button>
                        ) : null}
                        {app.canRequestCancel ? (
                          <button
                            type="button"
                            onClick={() => setRequestCancelTarget(app)}
                            disabled={requestingCancelId === app.id}
                            className="text-sm font-semibold text-rose-700 hover:text-rose-900 disabled:opacity-60"
                          >
                            Request cancellation
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
