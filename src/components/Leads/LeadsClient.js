"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { startOutgoingCall } from "@/lib/startOutgoingCall";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";
import { digitsOnly, formatLandline, validatePhone } from "@/lib/phoneFormat";
import StateSelectField, { StateLocalTime } from "@/components/Leads/StateSelectField";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";
const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";

function formatLeadName(lead) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() || "—";
}

export default function LeadsClient() {
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
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [notes, setNotes] = useState("");
  const [phoneValidation, setPhoneValidation] = useState({ isValid: true, message: "" });

  const canStartCall =
    isPrimaryTab !== false && (registered || voiceDisplaced) && !sdkInitializing;

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load leads");
      setLeads(json.leads || []);
    } catch (e) {
      setError(e.message || "Failed to load leads");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  function resetForm() {
    setPhone("");
    setFirstName("");
    setLastName("");
    setCity("");
    setState("");
    setZipCode("");
    setNotes("");
    setPhoneValidation({ isValid: true, message: "" });
  }

  async function onAddLead(e) {
    e.preventDefault();
    const v = validatePhone(phone);
    setPhoneValidation(v);
    if (!v.isValid || !firstName.trim()) {
      if (!firstName.trim()) setError("First name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phone: digitsOnly(phone),
          firstName: firstName.trim(),
          lastName: lastName.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          zipCode: zipCode.trim() || undefined,
          notes: notes.trim() || undefined,
          source: "manual",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to add lead");
      resetForm();
      setShowForm(false);
      await loadLeads();
    } catch (err) {
      setError(err.message || "Failed to add lead");
    } finally {
      setSaving(false);
    }
  }

  async function onCallLead(lead) {
    if (session || lead.status === "dnc") return;
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
        customerStatus: "queued",
        toNumber: result.call.toNumber,
        phoneLabel: formatLandline(digitsOnly(lead.phone)) || lead.phone,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Your leads</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Add a lead first, then call from the table (agent connects first).
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
              <label className={labelClass}>First name *</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Last name</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
              <StateSelectField
                value={state}
                onChange={setState}
                disabled={saving}
                showLocalTime={false}
              />
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
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last call</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No leads yet. Add your first lead above.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="text-zinc-800 dark:text-zinc-200">
                  <td className="px-4 py-3 font-medium">{formatLeadName(lead)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{lead.phone}</td>
                  <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                    {[lead.state, lead.city, lead.zipCode].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 capitalize">{lead.status}</td>
                  <td className="px-4 py-3 text-xs">
                    {lead.lastCallAt ? new Date(lead.lastCallAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
