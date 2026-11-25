"use client";

import { useEffect, useState } from "react";

const inputClass =
  "w-full rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-teal-800 dark:bg-teal-950/40 dark:text-zinc-100";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300";

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function SoftwareLeadDetailClient({ leadId }) {
  const [lead, setLead] = useState(null);
  const [appointmentAt, setAppointmentAt] = useState("");
  const [appointmentNote, setAppointmentNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/software-leads/${leadId}`, { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load lead");
        if (cancelled) return;
        setLead(json.lead);
        setAppointmentAt(toDatetimeLocal(json.lead?.leadAppointmentAt));
        setAppointmentNote(json.lead?.leadAppointmentNote || "");
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load lead");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  async function onSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/software-leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          leadAppointmentAt: appointmentAt || null,
          leadAppointmentNote: appointmentNote,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save appointment");
      setLead(json.lead);
      window.dispatchEvent(new Event("appointments:changed"));
    } catch (err) {
      setError(err.message || "Failed to save appointment");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading lead…</p>;
  if (!lead) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error || "Lead not found"}</p>
    );
  }

  return (
    <div className="space-y-4 rounded-3xl border border-teal-200 bg-teal-50/70 p-4 dark:border-teal-900 dark:bg-teal-950/20">
      <div className="rounded-2xl border border-teal-200 bg-white p-4 dark:border-teal-800 dark:bg-zinc-950">
        <h2 className="text-xl font-semibold text-teal-950 dark:text-teal-100">{lead.fullName}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{lead.phone}</p>
        {lead.company ? <p className="text-sm text-zinc-600 dark:text-zinc-300">{lead.company}</p> : null}
        {lead.email ? <p className="text-sm text-zinc-600 dark:text-zinc-300">{lead.email}</p> : null}
        {lead.notes ? <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-200">{lead.notes}</p> : null}
      </div>
      <form onSubmit={onSave} className="space-y-3 rounded-2xl border border-teal-200 bg-white p-4 dark:border-teal-800 dark:bg-zinc-950">
        <h3 className="text-sm font-semibold text-teal-950 dark:text-teal-100">Appointment</h3>
        <div>
          <label className={labelClass} htmlFor="detail-appt">
            When
          </label>
          <input
            id="detail-appt"
            type="datetime-local"
            className={inputClass}
            value={appointmentAt}
            onChange={(e) => setAppointmentAt(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="detail-appt-note">
            Note
          </label>
          <input
            id="detail-appt-note"
            className={inputClass}
            value={appointmentNote}
            onChange={(e) => setAppointmentNote(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-teal-600/30 hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save appointment"}
        </button>
      </form>
    </div>
  );
}
