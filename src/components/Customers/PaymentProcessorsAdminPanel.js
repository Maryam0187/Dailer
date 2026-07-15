"use client";

import { useCallback, useEffect, useState } from "react";

const inputClass =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

const btnPrimary =
  "inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50";

const emptyDraft = { fullName: "", shortCode: "", code: "" };

export default function PaymentProcessorsAdminPanel({ onProcessorsUpdated }) {
  const [processors, setProcessors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [newDraft, setNewDraft] = useState(emptyDraft);

  const loadProcessors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payment-processors", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load payment processors");
      const rows = json.processors || [];
      setProcessors(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((row) => [
            row.id,
            { fullName: row.fullName, shortCode: row.shortCode, active: row.active !== false },
          ]),
        ),
      );
    } catch (e) {
      setError(e.message || "Failed to load payment processors");
      setProcessors([]);
      setDrafts({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProcessors();
  }, [loadProcessors]);

  async function saveProcessor(row) {
    const draft = drafts[row.id];
    if (!draft) return;
    setSavingId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/payment-processors/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: draft.fullName,
          shortCode: draft.shortCode,
          active: draft.active,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save processor");
      setProcessors((prev) => prev.map((p) => (p.id === row.id ? json.processor : p)));
      setDrafts((prev) => ({
        ...prev,
        [row.id]: {
          fullName: json.processor.fullName,
          shortCode: json.processor.shortCode,
          active: json.processor.active !== false,
        },
      }));
      onProcessorsUpdated?.();
    } catch (e) {
      setError(e.message || "Failed to save processor");
    } finally {
      setSavingId(null);
    }
  }

  async function createProcessor(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/payment-processors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: newDraft.fullName,
          shortCode: newDraft.shortCode,
          code: newDraft.code || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to add processor");
      setNewDraft(emptyDraft);
      await loadProcessors();
      onProcessorsUpdated?.();
    } catch (err) {
      setError(err.message || "Failed to add processor");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Payment processors</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Gateways used when logging charged, declined, or chargeback. Short code appears in the
          charge form, badges, and payment logs.
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        {loading ? (
          <p className="px-4 py-6 text-sm text-zinc-600 dark:text-zinc-400">Loading processors…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Full name</th>
                  <th className="px-4 py-3">Short code</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {processors.map((row) => {
                  const draft = drafts[row.id] || {
                    fullName: row.fullName,
                    shortCode: row.shortCode,
                    active: row.active !== false,
                  };
                  const dirty =
                    draft.fullName !== row.fullName ||
                    draft.shortCode !== row.shortCode ||
                    draft.active !== (row.active !== false);
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                        {row.code}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className={inputClass}
                          value={draft.fullName}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [row.id]: { ...draft, fullName: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className={inputClass}
                          value={draft.shortCode}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [row.id]: { ...draft, shortCode: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <input
                            type="checkbox"
                            checked={draft.active}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.id]: { ...draft, active: e.target.checked },
                              }))
                            }
                          />
                          Active
                        </label>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className={btnPrimary}
                          disabled={!dirty || savingId === row.id}
                          onClick={() => void saveProcessor(row)}
                        >
                          {savingId === row.id ? "Saving…" : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">Add processor</h3>
        <form onSubmit={createProcessor} className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className={labelClass}>
            Full name *
            <input
              className={inputClass}
              value={newDraft.fullName}
              onChange={(e) => setNewDraft((prev) => ({ ...prev, fullName: e.target.value }))}
              placeholder="e.g. NMI"
              required
            />
          </label>
          <label className={labelClass}>
            Short code *
            <input
              className={inputClass}
              value={newDraft.shortCode}
              onChange={(e) => setNewDraft((prev) => ({ ...prev, shortCode: e.target.value }))}
              placeholder="e.g. NM"
              required
            />
          </label>
          <label className={labelClass}>
            Code (optional)
            <input
              className={inputClass}
              value={newDraft.code}
              onChange={(e) => setNewDraft((prev) => ({ ...prev, code: e.target.value }))}
              placeholder="auto from name"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className={btnPrimary} disabled={creating}>
              {creating ? "Adding…" : "Add processor"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
