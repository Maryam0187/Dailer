"use client";

import { useEffect, useState } from "react";

export default function NotificationScheduleSection() {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/push/schedule", { credentials: "include", cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!cancelled) {
          if (res.ok) setSchedule(json.schedule);
          else setError(json.error || "Failed to load schedule");
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to load schedule");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function update(patch) {
    setSchedule((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function toggleDay(day) {
    setSchedule((prev) => {
      if (!prev) return prev;
      const set = new Set(prev.allowDays || []);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      const allowDays = [...set].sort((a, b) => a - b);
      return { ...prev, allowDays };
    });
  }

  async function onSave() {
    if (!schedule) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/push/schedule", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleEnabled: schedule.scheduleEnabled,
          timezone: schedule.timezone,
          allowStartLocal: schedule.allowStartLocal,
          allowEndLocal: schedule.allowEndLocal,
          allowDays: schedule.allowDays,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Save failed");
        return;
      }
      setSchedule(json.schedule);
      setMessage(
        json.schedule?.scheduleEnabled
          ? json.schedule.inQuietHours
            ? "Saved. You are in quiet hours now — others can still Notify anyway."
            : "Saved. Notifications allowed in your window."
          : "Saved. Notifications allowed any time.",
      );
    } catch (err) {
      setError(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500">Loading notification hours…</p>
      </section>
    );
  }

  if (!schedule) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-rose-600">{error || "Could not load schedule"}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Notification hours
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Like Slack: outside this window, teammates must tap Notify anyway to push you.
            Applies to all your subscribed devices.
          </p>
        </div>
        {schedule.scheduleEnabled ? (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              schedule.inQuietHours
                ? "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
            }`}
          >
            {schedule.inQuietHours ? "Quiet hours now" : "In allow window"}
          </span>
        ) : null}
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        <input
          type="checkbox"
          checked={Boolean(schedule.scheduleEnabled)}
          onChange={(e) => update({ scheduleEnabled: e.target.checked })}
          className="rounded border-zinc-300"
        />
        Limit notifications to a schedule
      </label>

      {schedule.scheduleEnabled ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-zinc-500">Timezone</span>
              <select
                value={schedule.timezone}
                onChange={(e) => update({ timezone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {(schedule.timezoneOptions || []).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-zinc-500">Allow from</span>
              <input
                type="time"
                value={schedule.allowStartLocal}
                onChange={(e) => update({ allowStartLocal: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="block text-sm">
              <span className="text-zinc-500">Allow until</span>
              <input
                type="time"
                value={schedule.allowEndLocal}
                onChange={(e) => update({ allowEndLocal: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>

          <div>
            <p className="text-sm text-zinc-500">Days</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(schedule.weekdayOptions || []).map((d) => {
                const on = (schedule.allowDays || []).includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                      on
                        ? "bg-sky-700 text-white"
                        : "border border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave()}
          className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save hours"}
        </button>
        {message ? <span className="text-sm text-zinc-600 dark:text-zinc-400">{message}</span> : null}
        {error ? <span className="text-sm text-rose-600">{error}</span> : null}
      </div>
    </section>
  );
}
