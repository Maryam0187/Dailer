"use client";

import { useCallback, useEffect, useState } from "react";

export default function IvrAffinitySettingsAdmin() {
  const [days, setDays] = useState(6);
  const [minDays, setMinDays] = useState(1);
  const [maxDays, setMaxDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ivr/settings", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load settings");
      setDays(Number(json.settings?.callbackAffinityDays) || 6);
      setMinDays(Number(json.limits?.minDays) || 1);
      setMaxDays(Number(json.limits?.maxDays) || 30);
      setSavedAt(json.settings?.updatedAt || null);
    } catch (err) {
      setError(err?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ivr/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callbackAffinityDays: Number(days) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save");
      setDays(Number(json.settings?.callbackAffinityDays) || days);
      setSavedAt(json.settings?.updatedAt || new Date().toISOString());
    } catch (err) {
      setError(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void save(e)}
      className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Callback notify lookback
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Notify agents who placed an outbound call to this number within the last N days
        (then lead owner if none). Admins always get notified.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Days
          <input
            type="number"
            min={minDays}
            max={maxDays}
            step={1}
            disabled={loading || saving}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="mt-1 block h-9 w-24 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <button
          type="submit"
          disabled={loading || saving}
          className="h-9 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {savedAt ? (
          <span className="text-[11px] text-zinc-500">
            Updated {new Date(savedAt).toLocaleString()}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <p className="mt-2 text-[11px] text-zinc-500">
        Allowed range: {minDays}–{maxDays} days.
      </p>
    </form>
  );
}
