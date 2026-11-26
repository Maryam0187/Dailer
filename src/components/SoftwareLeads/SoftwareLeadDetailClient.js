"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import IconTooltipButton, { CloseIcon, EditIcon, ExpandIcon } from "@/components/Leads/IconTooltipButton";

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const emptyDetails = {
  fullName: "",
  phone: "",
  company: "",
  email: "",
  notes: "",
};

export default function SoftwareLeadDetailClient({ leadId, variant = "page", onClose, onEdit, onSaved }) {
  const isSidebar = variant === "sidebar";
  const [lead, setLead] = useState(null);
  const [details, setDetails] = useState(emptyDetails);
  const [appointmentAt, setAppointmentAt] = useState("");
  const [appointmentNote, setAppointmentNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
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
        setDetails({
          fullName: json.lead?.fullName || "",
          phone: json.lead?.phone || "",
          company: json.lead?.company || "",
          email: json.lead?.email || "",
          notes: json.lead?.notes || "",
        });
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

  function setDetail(key, value) {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }

  async function onSaveDetails(e) {
    e.preventDefault();
    setSavingDetails(true);
    setError(null);
    try {
      const res = await fetch(`/api/software-leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(details),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save lead");
      setLead(json.lead);
      setDetails({
        fullName: json.lead?.fullName || "",
        phone: json.lead?.phone || "",
        company: json.lead?.company || "",
        email: json.lead?.email || "",
        notes: json.lead?.notes || "",
      });
      onSaved?.(json.lead);
    } catch (err) {
      setError(err.message || "Failed to save lead");
    } finally {
      setSavingDetails(false);
    }
  }

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
      onSaved?.(json.lead);
      window.dispatchEvent(new Event("appointments:changed"));
    } catch (err) {
      setError(err.message || "Failed to save appointment");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!isSidebar) return undefined;
    function onKey(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSidebar, onClose]);

  const fields = loading ? (
    <p className="text-sm text-zinc-500">Loading lead…</p>
  ) : !lead ? (
    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error || "Lead not found"}</p>
  ) : (
    <div className="space-y-4">
      <form
        onSubmit={onSaveDetails}
        className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Lead details</h2>
        </div>
        <div>
          <label className={labelClass} htmlFor="detail-name">
            Name
          </label>
          <input
            id="detail-name"
            className={inputClass}
            value={details.fullName}
            onChange={(e) => setDetail("fullName", e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="detail-phone">
            Phone
          </label>
          <input
            id="detail-phone"
            className={inputClass}
            value={details.phone}
            onChange={(e) => setDetail("phone", e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="detail-company">
            Company
          </label>
          <input
            id="detail-company"
            className={inputClass}
            value={details.company}
            onChange={(e) => setDetail("company", e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="detail-email">
            Email
          </label>
          <input
            id="detail-email"
            type="email"
            className={inputClass}
            value={details.email}
            onChange={(e) => setDetail("email", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="detail-notes">
            Notes
          </label>
          <textarea
            id="detail-notes"
            className={inputClass}
            rows={2}
            value={details.notes}
            onChange={(e) => setDetail("notes", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={savingDetails}
            className="rounded-xl bg-indigo-950 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-900 disabled:opacity-50"
          >
            {savingDetails ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}
      <form onSubmit={onSave} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Appointment</h3>
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
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-indigo-950 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-900 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save appointment"}
        </button>
      </form>
    </div>
  );

  if (!isSidebar) return fields;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-[2px]"
        aria-label="Close lead details"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 bg-gradient-to-r from-indigo-50/80 to-white px-5 py-4 dark:border-zinc-800 dark:from-indigo-950/30 dark:to-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                Software lead
                {lead?.id ? (
                  <span className="ml-2 font-mono normal-case tracking-normal text-zinc-500 dark:text-zinc-400">
                    #{lead.id}
                  </span>
                ) : null}
              </p>
              <h2 className="mt-1 truncate text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                {lead?.fullName || "Lead details"}
              </h2>
              {lead?.phone ? (
                <p className="mt-1 font-mono text-sm text-zinc-600 dark:text-zinc-400">{lead.phone}</p>
              ) : null}
              {lead?.company ? (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{lead.company}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-start gap-1.5">
              {lead && onEdit ? (
                <IconTooltipButton title="Edit" onClick={() => onEdit(lead)}>
                  <EditIcon />
                </IconTooltipButton>
              ) : null}
              {lead ? (
                <Link
                  href={`/software-leads/${lead.id}`}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  title="Open full page"
                  aria-label="Open full page"
                >
                  <ExpandIcon className="h-4 w-4" />
                </Link>
              ) : null}
              <IconTooltipButton title="Close" onClick={onClose}>
                <CloseIcon />
              </IconTooltipButton>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{fields}</div>
      </aside>
    </>
  );
}
