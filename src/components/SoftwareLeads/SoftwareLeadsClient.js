"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

export default function SoftwareLeadsClient() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    company: "",
    email: "",
    notes: "",
    leadAppointmentAt: "",
    leadAppointmentNote: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/software-leads", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load software leads");
      setLeads(Array.isArray(json.leads) ? json.leads : []);
    } catch (err) {
      setError(err.message || "Failed to load software leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/software-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone,
          company: form.company,
          email: form.email,
          notes: form.notes,
          leadAppointmentAt: form.leadAppointmentAt || null,
          leadAppointmentNote: form.leadAppointmentNote,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to create lead");
      setForm({
        fullName: "",
        phone: "",
        company: "",
        email: "",
        notes: "",
        leadAppointmentAt: "",
        leadAppointmentNote: "",
      });
      if (form.leadAppointmentAt) {
        window.dispatchEvent(new Event("appointments:changed"));
      }
      await load();
    } catch (err) {
      setError(err.message || "Failed to create lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 rounded-3xl border border-teal-200 bg-teal-50/70 p-4 dark:border-teal-900 dark:bg-teal-950/20 sm:p-5">
      <form
        onSubmit={onSubmit}
        className="grid gap-3 rounded-2xl border border-teal-200 bg-white p-4 shadow-sm shadow-teal-200/40 dark:border-teal-800 dark:bg-zinc-950 dark:shadow-none sm:grid-cols-2"
      >
        <div>
          <label className={labelClass} htmlFor="sw-name">
            Name
          </label>
          <input
            id="sw-name"
            className={inputClass}
            value={form.fullName}
            onChange={(e) => setField("fullName", e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="sw-phone">
            Phone
          </label>
          <input
            id="sw-phone"
            className={inputClass}
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="sw-company">
            Company
          </label>
          <input
            id="sw-company"
            className={inputClass}
            value={form.company}
            onChange={(e) => setField("company", e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="sw-email">
            Email
          </label>
          <input
            id="sw-email"
            type="email"
            className={inputClass}
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="sw-appt">
            Appointment
          </label>
          <input
            id="sw-appt"
            type="datetime-local"
            className={inputClass}
            value={form.leadAppointmentAt}
            onChange={(e) => setField("leadAppointmentAt", e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="sw-appt-note">
            Appointment note
          </label>
          <input
            id="sw-appt-note"
            className={inputClass}
            value={form.leadAppointmentNote}
            onChange={(e) => setField("leadAppointmentNote", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="sw-notes">
            Notes
          </label>
          <textarea
            id="sw-notes"
            className={inputClass}
            rows={2}
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-teal-600/30 hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create lead"}
          </button>
        </div>
      </form>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-teal-200 bg-white dark:border-teal-900 dark:bg-zinc-950">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-teal-200 bg-teal-100/80 text-[11px] font-semibold uppercase tracking-wide text-teal-800 dark:border-teal-900 dark:bg-teal-950/60 dark:text-teal-200">
            <tr>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">Phone</th>
              <th className="px-3 py-2.5">Company</th>
              <th className="px-3 py-2.5">Appointment</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-zinc-500">
                  Loading software leads…
                </td>
              </tr>
            ) : null}
            {!loading && leads.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-zinc-500">
                  No software leads yet.
                </td>
              </tr>
            ) : null}
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t border-teal-100 hover:bg-teal-50/70 dark:border-teal-950 dark:hover:bg-teal-950/30">
                <td className="px-3 py-3">
                  <Link href={lead.href} className="font-semibold text-teal-950 hover:underline dark:text-teal-100">
                    {lead.fullName}
                  </Link>
                </td>
                <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">{lead.phone}</td>
                <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">{lead.company || "—"}</td>
                <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">
                  {lead.leadAppointmentAt ? toDatetimeLocal(lead.leadAppointmentAt).replace("T", " ") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
