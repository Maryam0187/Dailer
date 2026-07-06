"use client";

import { useCallback, useEffect, useState } from "react";
import { WORKFLOW_TAG_CATEGORY_LABELS } from "@/lib/workflowTagLabels";

const inputClass =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

export default function WorkflowTagsAdminPanel({ onTagsUpdated }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);
  const [drafts, setDrafts] = useState({});

  const loadTags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workflow-tags", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load tag labels");
      const rows = json.tags || [];
      setTags(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((tag) => [tag.id, { fullLabel: tag.fullLabel, shortLabel: tag.shortLabel }]),
        ),
      );
    } catch (e) {
      setError(e.message || "Failed to load tag labels");
      setTags([]);
      setDrafts({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  async function saveTag(tag) {
    const draft = drafts[tag.id];
    if (!draft) return;
    setSavingId(tag.id);
    setError(null);
    try {
      const res = await fetch(`/api/workflow-tags/${tag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullLabel: draft.fullLabel,
          shortLabel: draft.shortLabel,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save tag");
      setTags((prev) => prev.map((row) => (row.id === tag.id ? json.tag : row)));
      setDrafts((prev) => ({
        ...prev,
        [tag.id]: { fullLabel: json.tag.fullLabel, shortLabel: json.tag.shortLabel },
      }));
      onTagsUpdated?.();
    } catch (e) {
      setError(e.message || "Failed to save tag");
    } finally {
      setSavingId(null);
    }
  }

  const grouped = tags.reduce((acc, tag) => {
    if (!acc[tag.category]) acc[tag.category] = [];
    acc[tag.category].push(tag);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Workflow tag labels</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Agents see the short label in the workflow. Admins see the full label in the workflow and both forms here.
        </p>
      </section>

      {loading ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading tag labels…</p>
      ) : (
        Object.entries(grouped).map(([category, rows]) => (
          <section
            key={category}
            className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/60">
              <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                {WORKFLOW_TAG_CATEGORY_LABELS[category] || category}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">Key</th>
                    <th className="px-4 py-3">Full label</th>
                    <th className="px-4 py-3">Short label</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {rows.map((tag) => {
                    const draft = drafts[tag.id] || { fullLabel: "", shortLabel: "" };
                    const dirty =
                      draft.fullLabel !== tag.fullLabel || draft.shortLabel !== tag.shortLabel;
                    return (
                      <tr key={tag.id}>
                        <td className="px-4 py-3 font-mono text-xs text-zinc-500">{tag.tagKey}</td>
                        <td className="px-4 py-3">
                          <label className={labelClass}>Full label</label>
                          <input
                            className={inputClass}
                            value={draft.fullLabel}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [tag.id]: { ...draft, fullLabel: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          <label className={labelClass}>Short label</label>
                          <input
                            className={inputClass}
                            value={draft.shortLabel}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [tag.id]: { ...draft, shortLabel: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-4 py-3 align-bottom">
                          <button
                            type="button"
                            disabled={!dirty || savingId === tag.id}
                            onClick={() => void saveTag(tag)}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {savingId === tag.id ? "Saving…" : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
