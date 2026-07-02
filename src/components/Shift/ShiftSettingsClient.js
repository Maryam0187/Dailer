"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getTimezoneLabel,
  getTimezoneOptionLabel,
  utcHhmmToZonedHhmm,
  zonedHhmmToUtcHhmm,
} from "@/lib/shiftTime.cjs";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

function statusStyles(status) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
  if (status === "ended") {
    return "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300";
}

export default function ShiftSettingsClient() {
  const [enabled, setEnabled] = useState(true);
  const [startLocal, setStartLocal] = useState("18:00");
  const [endLocal, setEndLocal] = useState("23:00");
  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [timezoneOptions, setTimezoneOptions] = useState([]);
  const [windowLabel, setWindowLabel] = useState("");
  const [shiftStatus, setShiftStatus] = useState(null);
  const [grantDurationMinutes, setGrantDurationMinutes] = useState(120);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const timezoneLabel = useMemo(() => getTimezoneLabel(timezone), [timezone]);
  const utcPreview = useMemo(() => {
    const startUtc = zonedHhmmToUtcHhmm(startLocal, timezone);
    const endUtc = zonedHhmmToUtcHhmm(endLocal, timezone);
    if (!startUtc || !endUtc) return null;
    return `${startUtc} – ${endUtc} UTC`;
  }, [startLocal, endLocal, timezone]);

  function applySettings(settings, status) {
    setEnabled(settings.enabled !== false);
    setStartLocal(settings.startLocal || utcHhmmToZonedHhmm(settings.startUtc, settings.timezone) || "18:00");
    setEndLocal(settings.endLocal || utcHhmmToZonedHhmm(settings.endUtc, settings.timezone) || "23:00");
    setTimezone(settings.timezone || "Asia/Karachi");
    setGrantDurationMinutes(settings.afterShiftGrantDurationMinutes || 120);
    setTimezoneOptions(settings.timezoneOptions || []);
    setWindowLabel(settings.windowLabel || "");
    setShiftStatus(status || null);
  }

  async function loadSettings() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/shift/settings", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load shift settings");
      applySettings(json.settings || {}, json.shiftStatus);
    } catch (err) {
      setError(err.message || "Failed to load shift settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  function onTimezoneChange(nextTimezone) {
    const startUtc = zonedHhmmToUtcHhmm(startLocal, timezone);
    const endUtc = zonedHhmmToUtcHhmm(endLocal, timezone);
    if (startUtc) {
      setStartLocal(utcHhmmToZonedHhmm(startUtc, nextTimezone) || startLocal);
    }
    if (endUtc) {
      setEndLocal(utcHhmmToZonedHhmm(endUtc, nextTimezone) || endLocal);
    }
    setTimezone(nextTimezone);
    setSaved(false);
  }

  async function onSave(e) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/api/shift/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          enabled,
          startLocal,
          endLocal,
          timezone,
          afterShiftGrantDurationMinutes: grantDurationMinutes,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save shift settings");

      applySettings(json.settings || {}, json.shiftStatus);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("shift-status-changed"));
      }
      setSaved(true);
    } catch (err) {
      setError(err.message || "Failed to save shift settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading shift settings…</p>;
  }

  return (
    <div className="space-y-6">
      {shiftStatus ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${statusStyles(shiftStatus.status)}`}
        >
          <p className="font-semibold">{shiftStatus.label}</p>
          <p className="mt-1 opacity-90">{shiftStatus.detail}</p>
        </div>
      ) : null}

      <form
        className="max-w-xl space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        onSubmit={onSave}
      >
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-zinc-300 text-sky-600 focus:ring-sky-500"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setSaved(false);
            }}
          />
          <span>
            <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Enforce shift login window
            </span>
            <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">
              When off, agents can sign in any time. Admins and after-shift grants are unaffected.
            </span>
          </span>
        </label>

        <div>
          <label className={labelClass} htmlFor="shift-timezone">
            Timezone
          </label>
          <select
            id="shift-timezone"
            className={inputClass}
            value={timezone}
            onChange={(e) => onTimezoneChange(e.target.value)}
          >
            {(timezoneOptions.length > 0
              ? timezoneOptions
              : [{ value: "Asia/Karachi", label: "Pakistan (PKT)" }]
            ).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label || getTimezoneOptionLabel(opt.value)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="shift-start-local">
              Shift start
            </label>
            <input
              id="shift-start-local"
              type="time"
              className={inputClass}
              value={startLocal}
              onChange={(e) => {
                setStartLocal(e.target.value);
                setSaved(false);
              }}
              required
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{timezoneLabel}</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="shift-end-local">
              Shift end
            </label>
            <input
              id="shift-end-local"
              type="time"
              className={inputClass}
              value={endLocal}
              onChange={(e) => {
                setEndLocal(e.target.value);
                setSaved(false);
              }}
              required
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{timezoneLabel}</p>
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="shift-grant-duration">
            Default after-shift grant duration
          </label>
          <select
            id="shift-grant-duration"
            className={inputClass}
            value={grantDurationMinutes}
            onChange={(e) => {
              setGrantDurationMinutes(Number(e.target.value));
              setSaved(false);
            }}
          >
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
            <option value={120}>2 hours</option>
            <option value={240}>4 hours</option>
            <option value={480}>8 hours</option>
            <option value={720}>12 hours</option>
            <option value={1440}>24 hours</option>
          </select>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Full and limited after-shift access auto-revoke after this time.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-950/60">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">
            {windowLabel || "—"}
          </p>
          {utcPreview ? (
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">Stored as {utcPreview}</p>
          ) : null}
        </div>

        {error ? <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p> : null}
        {saved ? (
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Shift settings saved.</p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save shift settings"}
        </button>
      </form>
    </div>
  );
}
