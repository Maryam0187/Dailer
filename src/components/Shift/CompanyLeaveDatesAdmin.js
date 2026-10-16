"use client";

import { useCallback, useEffect, useState } from "react";

export default function CompanyLeaveDatesAdmin() {
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const [calendarDate, setCalendarDate] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/company-leave-dates", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load leave dates");
      setDates(json.dates || []);
    } catch (err) {
      setError(err.message || "Failed to load leave dates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage("");
    try {
      const res = await fetch("/api/company-leave-dates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarDate, label }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to add leave date");
      setCalendarDate("");
      setLabel("");
      setMessage("Leave date added.");
      await load();
    } catch (err) {
      setError(err.message || "Failed to add leave date");
    } finally {
      setSaving(false);
    }
  }

  async function onRemove(id) {
    if (!window.confirm("Remove this company leave date?")) return;
    setBusyId(id);
    setError(null);
    setMessage("");
    try {
      const res = await fetch(`/api/company-leave-dates?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to remove leave date");
      setMessage("Leave date removed.");
      await load();
    } catch (err) {
      setError(err.message || "Failed to remove leave date");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
          Company leave dates
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Mark specific dates as public holidays or company leave. All agents are attendance-exempt
          on these days (same as weekly leave days).
        </p>
      </div>

      <form onSubmit={(e) => void onAdd(e)} className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="company-leave-date"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
          >
            Date
          </label>
          <input
            id="company-leave-date"
            type="date"
            required
            value={calendarDate}
            onChange={(e) => setCalendarDate(e.target.value)}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label
            htmlFor="company-leave-label"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
          >
            Label (optional)
          </label>
          <input
            id="company-leave-label"
            type="text"
            maxLength={255}
            placeholder="e.g. Public holiday"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !calendarDate}
          className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add leave date"}
        </button>
      </form>

      {error ? (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      ) : null}

      <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
            <tr>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Date
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Label
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Added by
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {" "}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : dates.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-zinc-500">
                  No company leave dates yet.
                </td>
              </tr>
            ) : (
              dates.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2.5 font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                    {row.calendarDate}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300">
                    {row.label || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">
                    {row.createdByUsername || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void onRemove(row.id)}
                      className="rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                    >
                      {busyId === row.id ? "…" : "Remove"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
