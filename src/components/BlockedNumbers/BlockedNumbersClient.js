"use client";

import { useCallback, useEffect, useState } from "react";

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function BlockedNumbersClient() {
  const [numbers, setNumbers] = useState([]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/blocked-numbers", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load blocked numbers");
      setNumbers(Array.isArray(json.numbers) ? json.numbers : []);
    } catch (err) {
      setError(err?.message || "Failed to load blocked numbers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addNumber(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/blocked-numbers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to add number");
      setPhoneNumber("");
      setReason("");
      await load();
    } catch (err) {
      setError(err?.message || "Failed to add number");
    } finally {
      setSaving(false);
    }
  }

  async function removeNumber(id) {
    setRemovingId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/blocked-numbers", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to remove number");
      setNumbers((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError(err?.message || "Failed to remove number");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => void addNumber(e)}
        className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Add a number</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Twilio and Zoom both refuse this destination. The call window opens, the agent hears
          “The person is not available,” and the call then ends. The log shows no-answer.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block min-w-[16rem] flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Phone number
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="5551234567"
              required
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="block min-w-[16rem] flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Reason (optional)
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={255}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <button
            type="submit"
            disabled={saving || !phoneNumber.trim()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
          >
            {saving ? "Adding…" : "Block number"}
          </button>
        </div>
      </form>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Number</th>
              <th className="px-4 py-3 font-semibold">Reason</th>
              <th className="px-4 py-3 font-semibold">Added by</th>
              <th className="px-4 py-3 font-semibold">Added</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : numbers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-zinc-500">
                  No blocked numbers yet.
                </td>
              </tr>
            ) : (
              numbers.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-3 font-mono text-zinc-900 dark:text-zinc-100">
                    {row.phoneNumber}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{row.reason || "—"}</td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {row.createdByUsername || "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {formatWhen(row.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void removeNumber(row.id)}
                      disabled={removingId === row.id}
                      className="text-sm font-semibold text-red-700 hover:underline disabled:opacity-50 dark:text-red-300"
                    >
                      {removingId === row.id ? "Removing…" : "Remove"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
