"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { REPORT_EASTERN_TODAY_NOTICE, getReportPresetRange } from "@/lib/attendanceTime";
import IconTooltipButton, { EditIcon, ExpandIcon, ViewIcon } from "@/components/Leads/IconTooltipButton";
import SoftwareLeadDetailClient from "@/components/SoftwareLeads/SoftwareLeadDetailClient";

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const dateFieldClass =
  "h-9 w-[9.5rem] rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";
const chipIdleClass =
  "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800";
const chipActiveClass =
  "border-indigo-600 bg-indigo-100 text-indigo-950 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-100";

const DATE_PRESETS = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "Last 7 days" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom" },
];

const emptyForm = {
  fullName: "",
  phone: "",
  company: "",
  email: "",
  notes: "",
  leadAppointmentAt: "",
  leadAppointmentNote: "",
};

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formFromLead(lead) {
  return {
    fullName: lead.fullName || "",
    phone: lead.phone || "",
    company: lead.company || "",
    email: lead.email || "",
    notes: lead.notes || "",
    leadAppointmentAt: toDatetimeLocal(lead.leadAppointmentAt),
    leadAppointmentNote: lead.leadAppointmentNote || "",
  };
}

export default function SoftwareLeadsClient() {
  const initialRange = getReportPresetRange("today");
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [rangePreset, setRangePreset] = useState("today");
  const [rangeFrom, setRangeFrom] = useState(initialRange.from);
  const [rangeTo, setRangeTo] = useState(initialRange.to);
  const [appliedFrom, setAppliedFrom] = useState(initialRange.from);
  const [appliedTo, setAppliedTo] = useState(initialRange.to);
  const formRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (appliedFrom && appliedTo) {
        params.set("fromDate", appliedFrom);
        params.set("toDate", appliedTo);
      }
      const qs = params.toString();
      const res = await fetch(`/api/software-leads${qs ? `?${qs}` : ""}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load software leads");
      setLeads(Array.isArray(json.leads) ? json.leads : []);
    } catch (err) {
      setError(err.message || "Failed to load software leads");
    } finally {
      setLoading(false);
    }
  }, [appliedFrom, appliedTo]);

  useEffect(() => {
    void load();
  }, [load]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyRangePreset(preset) {
    setError(null);
    setRangePreset(preset);
    if (preset === "custom") return;
    const next = getReportPresetRange(preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
    setAppliedFrom(next.from);
    setAppliedTo(next.to);
  }

  function onApplyRange(e) {
    e.preventDefault();
    if (rangePreset !== "custom") return;
    if (!rangeFrom || !rangeTo) {
      setError("From date and to date are required");
      return;
    }
    if (rangeFrom > rangeTo) {
      setError("From date must be on or before to date");
      return;
    }
    setError(null);
    setAppliedFrom(rangeFrom);
    setAppliedTo(rangeTo);
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(false);
  }

  function startEdit(lead) {
    setEditingId(lead.id);
    setForm(formFromLead(lead));
    setError(null);
    setShowForm(true);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const editing = Boolean(editingId);
    try {
      const res = await fetch(editing ? `/api/software-leads/${editingId}` : "/api/software-leads", {
        method: editing ? "PATCH" : "POST",
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
      if (!res.ok) throw new Error(json?.error || (editing ? "Failed to save lead" : "Failed to create lead"));
      setEditingId(null);
      setForm(emptyForm);
      setShowForm(false);
      if (editing || form.leadAppointmentAt) {
        window.dispatchEvent(new Event("appointments:changed"));
      }
      await load();
    } catch (err) {
      setError(err.message || (editing ? "Failed to save lead" : "Failed to create lead"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => (showForm && !editingId ? closeForm() : openCreate())}
          className={
            showForm && !editingId
              ? "rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              : "rounded-xl bg-indigo-950 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-900"
          }
        >
          {showForm && !editingId ? "Cancel" : "Create lead"}
        </button>
      </div>
      {showForm ? (
      <form
        ref={formRef}
        onSubmit={onSubmit}
        className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {editingId ? "Edit lead" : "New lead"}
          </h2>
        </div>
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
        <div className="sm:col-span-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeForm}
            disabled={saving}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-indigo-950 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-900 disabled:opacity-50"
          >
            {saving ? "Saving…" : editingId ? "Save changes" : "Create lead"}
          </button>
        </div>
      </form>
      ) : null}

      <form className="grid gap-3" onSubmit={onApplyRange}>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Date range
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyRangePreset(preset.id)}
                className={`h-9 rounded-lg border px-3 text-sm font-semibold ${
                  rangePreset === preset.id ? chipActiveClass : chipIdleClass
                }`}
              >
                {preset.label}
              </button>
            ))}
            {rangePreset === "custom" ? (
              <>
                <input
                  type="date"
                  aria-label="From date"
                  className={dateFieldClass}
                  value={rangeFrom}
                  onChange={(e) => {
                    setRangePreset("custom");
                    setRangeFrom(e.target.value);
                  }}
                />
                <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">to</span>
                <input
                  type="date"
                  aria-label="To date"
                  className={dateFieldClass}
                  value={rangeTo}
                  onChange={(e) => {
                    setRangePreset("custom");
                    setRangeTo(e.target.value);
                  }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="h-9 rounded-lg bg-indigo-950 px-3 text-sm font-semibold text-indigo-100 hover:bg-indigo-900 disabled:opacity-50"
                >
                  Apply
                </button>
              </>
            ) : null}
          </div>
          <p
            role="status"
            className="mt-2 inline-flex max-w-full items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <span className="shrink-0 font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
              Note
            </span>
            <span>{REPORT_EASTERN_TODAY_NOTICE}</span>
          </p>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {appliedFrom && appliedTo ? (
            <>
              Showing leads created in <span className="font-medium">{appliedFrom} — {appliedTo}</span>
            </>
          ) : (
            <>Showing leads across all dates.</>
          )}
        </p>
      </form>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-indigo-950 text-[11px] font-semibold uppercase tracking-wide text-indigo-100">
            <tr>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">Phone</th>
              <th className="px-3 py-2.5">Company</th>
              <th className="px-3 py-2.5">Appointment</th>
              <th className="px-3 py-2.5 text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                  Loading software leads…
                </td>
              </tr>
            ) : null}
            {!loading && leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                  No software leads yet.
                </td>
              </tr>
            ) : null}
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className={`border-t border-zinc-100 dark:border-zinc-800 ${
                  selectedLeadId === lead.id
                    ? "bg-indigo-50/70 dark:bg-indigo-950/30"
                    : editingId === lead.id
                      ? "bg-zinc-50 dark:bg-zinc-900"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
              >
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="font-semibold text-zinc-950 underline-offset-2 hover:underline dark:text-zinc-50"
                  >
                    {lead.fullName}
                  </button>
                </td>
                <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">{lead.phone}</td>
                <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">{lead.company || "—"}</td>
                <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">
                  {lead.leadAppointmentAt ? toDatetimeLocal(lead.leadAppointmentAt).replace("T", " ") : "—"}
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <IconTooltipButton title="Edit" onClick={() => startEdit(lead)}>
                      <EditIcon />
                    </IconTooltipButton>
                    <IconTooltipButton title="View" onClick={() => setSelectedLeadId(lead.id)}>
                      <ViewIcon />
                    </IconTooltipButton>
                    <Link
                      href={lead.href}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      title="Open full page"
                      aria-label="Open full page"
                    >
                      <ExpandIcon className="h-4 w-4" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedLeadId ? (
        <SoftwareLeadDetailClient
          leadId={selectedLeadId}
          variant="sidebar"
          onClose={() => setSelectedLeadId(null)}
          onEdit={(lead) => {
            setSelectedLeadId(null);
            startEdit(lead);
          }}
          onSaved={(updated) => {
            if (!updated?.id) return;
            setLeads((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
          }}
        />
      ) : null}
    </div>
  );
}
