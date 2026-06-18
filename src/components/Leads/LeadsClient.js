"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { startOutgoingCall } from "@/lib/startOutgoingCall";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";
import { digitsOnly, formatLandline, validatePhone } from "@/lib/phoneFormat";
import { getLeadStatusMeta, STATUS_BADGE_CLASS } from "@/lib/leadStatus";
import { canUseLeadFilters, canViewLeadStats, hasFullLeadAccess } from "@/lib/leadRoles";
import { formatLeadPhoneDisplay, shouldRedactLeadPhones } from "@/lib/maskPhone";
import StateSelectField, { StateLocalTime } from "@/components/Leads/StateSelectField";
import LeadDetailPanel from "@/components/Leads/LeadDetailPanel";
import LeadsStatsPanel from "@/components/Leads/LeadsStatsPanel";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getPresetRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") {
    const d = formatDateInput(today);
    return { from: d, to: d };
  }
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const d = formatDateInput(y);
    return { from: d, to: d };
  }
  if (preset === "week") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: formatDateInput(from), to: formatDateInput(today) };
  }
  if (preset === "month") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: formatDateInput(from), to: formatDateInput(today) };
  }
  return { from: "", to: "" };
}

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

function formatLeadName(lead) {
  return lead.fullName?.trim() || "—";
}

function notePreview(notes) {
  const text = String(notes || "").trim();
  if (!text) return "—";
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

function StatusPill({ status }) {
  const meta = getLeadStatusMeta(status);
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE_CLASS[meta.tone]}`}
    >
      {meta.label}
    </span>
  );
}

export default function LeadsClient({ initialShowForm = false, userRole = "agent" }) {
  const { session, beginSession } = useActiveCall();
  const {
    ensureRegistered,
    registered,
    sdkInitializing,
    voiceDisplaced,
    isPrimaryTab,
    expectOutgoingIncomingLeg,
  } = useTwilioVoice();

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [callingId, setCallingId] = useState(null);
  const [showForm, setShowForm] = useState(initialShowForm);
  const [saving, setSaving] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState(null);

  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [cellNumber, setCellNumber] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [notes, setNotes] = useState("");
  const [supervisorFilter, setSupervisorFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [assignableAgents, setAssignableAgents] = useState([]);
  const [filterSupervisors, setFilterSupervisors] = useState([]);
  const [phoneValidation, setPhoneValidation] = useState({ isValid: true, message: "" });
  const [cellValidation, setCellValidation] = useState({ isValid: true, message: "" });
  const [activeView, setActiveView] = useState("list");
  const initialRange = getPresetRange("today");
  const [rangePreset, setRangePreset] = useState("today");
  const [rangeFrom, setRangeFrom] = useState(initialRange.from);
  const [rangeTo, setRangeTo] = useState(initialRange.to);
  const [appliedFrom, setAppliedFrom] = useState(initialRange.from);
  const [appliedTo, setAppliedTo] = useState(initialRange.to);
  const [sortBy, setSortBy] = useState("createdAt");

  const showLeadStats = canViewLeadStats(userRole);
  const showLeadFilters = canUseLeadFilters(userRole);
  const showSupervisorFilter = hasFullLeadAccess(userRole);
  const phonesRedacted = shouldRedactLeadPhones(userRole);
  const colSpan = showLeadFilters ? 8 : 7;

  const filteredAgents = useMemo(() => {
    if (!showSupervisorFilter || supervisorFilter === "all") return assignableAgents;
    return assignableAgents.filter((a) => String(a.supervisorId ?? "") === supervisorFilter);
  }, [assignableAgents, showSupervisorFilter, supervisorFilter]);

  const canStartCall =
    isPrimaryTab !== false && (registered || voiceDisplaced) && !sdkInitializing;

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (agentFilter && agentFilter !== "all") params.set("agentId", agentFilter);
      else if (supervisorFilter && supervisorFilter !== "all") params.set("supervisorId", supervisorFilter);
      if (appliedFrom && appliedTo) {
        params.set("fromDate", appliedFrom);
        params.set("toDate", appliedTo);
      }
      params.set("sortBy", sortBy);
      params.set("sortDir", "desc");
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/leads${qs}`, { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load leads");
      setLeads(json.leads || []);
    } catch (e) {
      setError(e.message || "Failed to load leads");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [agentFilter, supervisorFilter, appliedFrom, appliedTo, sortBy]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    if (!showLeadFilters) return;
    (async () => {
      try {
        const res = await fetch("/api/leads/assignable-agents", { credentials: "include", cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load agents");
        const agents = json.agents || [];
        setAssignableAgents(agents);
        setFilterSupervisors(json.supervisors || []);
      } catch (e) {
        setError(e.message || "Failed to load agents");
      }
    })();
  }, [showLeadFilters]);

  useEffect(() => {
    if (agentFilter === "all") return;
    if (!filteredAgents.some((a) => String(a.id) === agentFilter)) {
      setAgentFilter("all");
    }
  }, [agentFilter, filteredAgents]);

  function onSupervisorFilterChange(nextSupervisorId) {
    setSupervisorFilter(nextSupervisorId);
    setAgentFilter("all");
  }

  function applyRangePreset(preset) {
    setError(null);
    setRangePreset(preset);
    if (preset === "custom") return;
    const next = getPresetRange(preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
    setAppliedFrom(next.from);
    setAppliedTo(next.to);
  }

  async function onApplyRange(e) {
    e?.preventDefault?.();
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

  function resetForm() {
    setPhone("");
    setFullName("");
    setCellNumber("");
    setCity("");
    setState("");
    setZipCode("");
    setNotes("");
    setPhoneValidation({ isValid: true, message: "" });
    setCellValidation({ isValid: true, message: "" });
  }

  function handleLeadUpdated(updated) {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
  }

  async function onAddLead(e) {
    e.preventDefault();
    const phoneV = validatePhone(phone);
    const cellV = cellNumber.trim() ? validatePhone(cellNumber) : { isValid: true, message: "" };
    setPhoneValidation(phoneV);
    setCellValidation(cellV);
    if (!phoneV.isValid || !cellV.isValid || !fullName.trim()) {
      if (!fullName.trim()) setError("Full name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        phone: digitsOnly(phone),
        fullName: fullName.trim(),
        cellNumber: cellNumber.trim() ? digitsOnly(cellNumber) : undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zipCode: zipCode.trim() || undefined,
        notes: notes.trim() || undefined,
        source: "manual",
      };
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to add lead");
      resetForm();
      setShowForm(false);
      await loadLeads();
      if (json.lead?.id) setSelectedLeadId(json.lead.id);
    } catch (err) {
      setError(err.message || "Failed to add lead");
    } finally {
      setSaving(false);
    }
  }

  async function onCallLead(lead) {
    if (phonesRedacted || session || lead.status === "dnc") return;
    setCallingId(lead.id);
    setError(null);
    try {
      expectOutgoingIncomingLeg(45000);
      if (!registered || sdkInitializing) await ensureRegistered();

      const result = await startOutgoingCall({ leadId: lead.id });
      if (!result.ok) throw new Error(result.error);

      beginSession({
        callId: result.call.id,
        callOwnedByMe: true,
        callMode: result.callMode || "direct",
        callKind: "lead",
        dialMode: "agent_first",
        toNumber: result.call.toNumber,
        phoneLabel: formatLeadPhoneDisplay(lead.phone, phonesRedacted || lead.phonesRedacted),
        customerName: formatLeadName(lead),
        leadId: lead.id,
      });
    } catch (e) {
      setError(e.message || "Call failed");
    } finally {
      setCallingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {showLeadStats ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveView("list")}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
              activeView === "list"
                ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            Leads list
          </button>
          <button
            type="button"
            onClick={() => setActiveView("stats")}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
              activeView === "stats"
                ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            Lead stats
          </button>
        </div>
      ) : null}

      {showLeadStats && activeView === "stats" ? <LeadsStatsPanel /> : null}

      {(showLeadStats ? activeView === "list" : true) ? (
        <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Your leads</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Click a lead to view notes, update status, and add comments.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v);
            setError(null);
          }}
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          {showForm ? "Cancel" : "+ Add lead"}
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={onAddLead}
          className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20"
        >
          <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">New lead</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Phone *</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  const formatted = formatLandline(e.target.value.replace(/[^\d*#+\-() ]/g, ""));
                  setPhone(formatted);
                  setPhoneValidation(validatePhone(formatted));
                }}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Full name *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Cell number</label>
              <input
                type="tel"
                value={cellNumber}
                onChange={(e) => {
                  const formatted = formatLandline(e.target.value.replace(/[^\d*#+\-() ]/g, ""));
                  setCellNumber(formatted);
                  if (formatted.trim()) setCellValidation(validatePhone(formatted));
                  else setCellValidation({ isValid: true, message: "" });
                }}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
              <StateSelectField value={state} onChange={setState} disabled={saving} showLocalTime={false} />
              <div>
                <label className={labelClass}>City</label>
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Zip code</label>
                <input
                  type="text"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  className={inputClass}
                  maxLength={16}
                />
              </div>
            </div>
          </div>
          <div className="mt-1">
            <StateLocalTime stateCode={state} />
          </div>
          <div className="mt-4">
            <label className={labelClass}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`${inputClass} min-h-[80px]`}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save lead"}
          </button>
        </form>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            void onApplyRange(e);
          }}
        >
          <div>
            <label className={labelClass}>Created date range</label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "today", label: "Today" },
                { id: "yesterday", label: "Yesterday" },
                { id: "week", label: "Last 7 days" },
                { id: "month", label: "This month" },
                { id: "custom", label: "Custom" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyRangePreset(p.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                    rangePreset === p.id
                      ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="leads-from-date" className={labelClass}>
                From date
              </label>
              <input
                id="leads-from-date"
                type="date"
                className={inputClass}
                value={rangeFrom}
                disabled={rangePreset !== "custom"}
                onChange={(e) => {
                  setRangePreset("custom");
                  setRangeFrom(e.target.value);
                }}
              />
            </div>
            <div>
              <label htmlFor="leads-to-date" className={labelClass}>
                To date
              </label>
              <input
                id="leads-to-date"
                type="date"
                className={inputClass}
                value={rangeTo}
                disabled={rangePreset !== "custom"}
                onChange={(e) => {
                  setRangePreset("custom");
                  setRangeTo(e.target.value);
                }}
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading || rangePreset !== "custom"}
                className="h-11 w-full rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Apply range
              </button>
            </div>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Showing leads created <span className="font-medium">{appliedFrom}</span> —{" "}
            <span className="font-medium">{appliedTo}</span>
          </p>
        </form>

        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {showLeadFilters && showSupervisorFilter ? (
              <div>
                <label className={labelClass}>Filter by supervisor</label>
                <select
                  value={supervisorFilter}
                  onChange={(e) => onSupervisorFilterChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="all">All supervisors</option>
                  {filterSupervisors.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.username}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {showLeadFilters ? (
              <div>
                <label className={labelClass}>Filter by agent</label>
                <select
                  value={agentFilter}
                  onChange={(e) => setAgentFilter(e.target.value)}
                  className={inputClass}
                >
                  <option value="all">All agents</option>
                  {filteredAgents.map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.username}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div>
              <span className={labelClass}>Sort by</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Sort leads">
                {[
                  { id: "createdAt", label: "Created" },
                  { id: "updatedAt", label: "Updated" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSortBy(option.id)}
                    className={`h-11 rounded-xl border px-4 text-sm font-semibold ${
                      sortBy === option.id
                        ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                    aria-pressed={sortBy === option.id}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Notes</th>
              {showLeadFilters ? <th className="px-4 py-3">Agent</th> : null}
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last call</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-8 text-center text-zinc-500">
                  {supervisorFilter !== "all" || agentFilter !== "all" || rangePreset !== "today"
                    ? "No leads match the selected filters."
                    : "No leads yet. Add your first lead above."}
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr
                  key={lead.id}
                  className={`text-zinc-800 dark:text-zinc-200 ${
                    selectedLeadId === lead.id ? "bg-emerald-50/60 dark:bg-emerald-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                  }`}
                >
                  <td className="px-4 py-3 font-medium">{formatLeadName(lead)}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {formatLeadPhoneDisplay(lead.phone, phonesRedacted || lead.phonesRedacted)}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                    {[lead.state, lead.city, lead.zipCode].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="max-w-[180px] px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400" title={lead.notes || undefined}>
                    {notePreview(lead.notes)}
                  </td>
                  {showLeadFilters ? (
                    <td className="px-4 py-3 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {lead.assignedUsername || "—"}
                    </td>
                  ) : null}
                  <td className="px-4 py-3">
                    <StatusPill status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {lead.lastCallAt ? new Date(lead.lastCallAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedLeadId(lead.id)}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        View
                      </button>
                      {!phonesRedacted ? (
                        <button
                          type="button"
                          disabled={
                            Boolean(session) ||
                            callingId === lead.id ||
                            !canStartCall ||
                            lead.status === "dnc"
                          }
                          onClick={() => void onCallLead(lead)}
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {callingId === lead.id ? "Calling…" : "Call"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedLead ? (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={() => setSelectedLeadId(null)}
          onLeadUpdated={handleLeadUpdated}
          onCallLead={phonesRedacted ? undefined : onCallLead}
          phonesRedacted={phonesRedacted || selectedLead.phonesRedacted}
          calling={callingId === selectedLead.id}
          canCall={canStartCall}
          hasActiveCall={Boolean(session)}
        />
      ) : null}
        </>
      ) : null}
    </div>
  );
}
