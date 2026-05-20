"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { startColdCall } from "@/lib/startColdCall";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";
import { digitsOnly, formatLandline, validatePhone } from "@/lib/phoneFormat";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";
const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-cyan-400 dark:focus:ring-cyan-500/20";

const COLD_DISPOSITIONS = [
  { id: "no_answer", label: "No answer" },
  { id: "busy", label: "Busy" },
  { id: "voicemail", label: "Voicemail" },
  { id: "not_interested", label: "Not interested" },
  { id: "wrong_number", label: "Wrong number" },
  { id: "interested", label: "Interested" },
];

export default function ColdDialPanel() {
  const { session, beginSession } = useActiveCall();
  const {
    ensureRegistered,
    registered,
    sdkInitializing,
    voiceDisplaced,
    isPrimaryTab,
    expectOutgoingIncomingLeg,
  } = useTwilioVoice();

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [validation, setValidation] = useState({ isValid: true, message: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [pendingDisposition, setPendingDisposition] = useState(null);
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [leadFirstName, setLeadFirstName] = useState("");
  const [leadNotes, setLeadNotes] = useState("");
  const [savingDisposition, setSavingDisposition] = useState(false);

  const hasActiveCall = Boolean(session);
  const canStartCall =
    isPrimaryTab !== false && (registered || voiceDisplaced) && !sdkInitializing;
  const canPlaceCall =
    Boolean(phone.trim()) &&
    validation.isValid &&
    !loading &&
    !hasActiveCall &&
    !pendingDisposition &&
    canStartCall;

  const onCallEnded = useCallback((e) => {
    const d = e?.detail || {};
    const callId = Number(d.callId);
    if (!Number.isInteger(callId) || callId <= 0) return;
    if (d.callKind !== "cold") return;
    setPendingDisposition({
      callId,
      toNumber: d.toNumber,
      phoneLabel: d.phoneLabel,
      contactName: d.customerName,
      city: d.city,
      state: d.state,
      zipCode: d.zipCode,
    });
    setLeadFirstName(String(d.customerName || "").trim());
  }, []);

  useEffect(() => {
    window.addEventListener("call-ended", onCallEnded);
    return () => window.removeEventListener("call-ended", onCallEnded);
  }, [onCallEnded]);

  function onPhoneChange(e) {
    const v = e.target.value.replace(/[^\d*#+\-() ]/g, "");
    const formatted = formatLandline(v);
    setPhone(formatted);
    setValidation(validatePhone(formatted));
    setError(null);
  }

  async function onCall() {
    const v = validatePhone(phone);
    setValidation(v);
    if (!v.isValid || hasActiveCall || pendingDisposition) return;
    const toDigits = digitsOnly(phone);
    setLoading(true);
    setError(null);
    try {
      expectOutgoingIncomingLeg(60000);
      if (!registered) await ensureRegistered();
      else if (sdkInitializing) await ensureRegistered();

      const result = await startColdCall({
        toNumber: toDigits,
        contactName: name.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zipCode: zipCode.trim() || undefined,
      });
      if (!result.ok) throw new Error(result.error);

      beginSession({
        callId: result.call.id,
        callOwnedByMe: true,
        callMode: result.callMode || "cold",
        callKind: "cold",
        dialMode: "customer_first",
        customerStatus: String(result.call?.status || "queued").toLowerCase(),
        toNumber: result.call.toNumber,
        phoneLabel: phone.trim() || formatLandline(toDigits),
        customerName: name.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zipCode: zipCode.trim() || undefined,
      });
      setPhone("");
      setName("");
      setValidation({ isValid: true, message: "" });
    } catch (e) {
      setError(e.message || "Cold dial failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveDisposition(disposition) {
    if (!pendingDisposition?.callId) return;
    setSavingDisposition(true);
    setError(null);
    try {
      const res = await fetch(`/api/calls/${pendingDisposition.callId}/disposition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ disposition }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save disposition");

      if (disposition === "interested") {
        setShowCreateLead(true);
      } else {
        setPendingDisposition(null);
        setShowCreateLead(false);
      }
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setSavingDisposition(false);
    }
  }

  async function onCreateLead(e) {
    e.preventDefault();
    if (!pendingDisposition) return;
    const firstName = leadFirstName.trim();
    if (!firstName) {
      setError("First name is required to create a lead");
      return;
    }
    setSavingDisposition(true);
    setError(null);
    try {
      const callId = Number(pendingDisposition.callId);
      if (Number.isInteger(callId) && callId > 0) {
        const dispRes = await fetch(`/api/calls/${callId}/disposition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ disposition: "interested" }),
        });
        const dispJson = await dispRes.json().catch(() => ({}));
        if (!dispRes.ok) throw new Error(dispJson?.error || "Failed to save call disposition");
      }

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phone: pendingDisposition.toNumber,
          firstName,
          city: pendingDisposition.city || city.trim() || undefined,
          state: pendingDisposition.state || state.trim() || undefined,
          zipCode: pendingDisposition.zipCode || zipCode.trim() || undefined,
          notes: leadNotes.trim() || undefined,
          source: "cold_dial",
          createdFromCallLogId: pendingDisposition.callId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to create lead");
      setPendingDisposition(null);
      setShowCreateLead(false);
      setLeadFirstName("");
      setLeadNotes("");
    } catch (err) {
      setError(err.message || "Failed to create lead");
    } finally {
      setSavingDisposition(false);
    }
  }

  const phoneInputBase =
    "w-full rounded-xl border-2 px-5 py-4 font-mono text-xl text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-500 focus:ring-2 focus:ring-offset-0 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:focus:ring-offset-0";

  return (
    <section className="relative overflow-hidden rounded-3xl border border-amber-200/90 bg-gradient-to-br from-white via-amber-50/40 to-orange-50/35 shadow-2xl shadow-amber-500/10 ring-1 ring-amber-300/40 dark:border-amber-900/50 dark:from-zinc-900 dark:via-zinc-900 dark:to-amber-950/20 dark:shadow-amber-950/25 dark:ring-amber-500/20">
      <div className="relative p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/80 pb-4 dark:border-zinc-800">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700/80 dark:text-amber-300/80">
              Cold outreach
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              Cold dial
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Customer is dialed first; you connect when they answer.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <span
              className={`h-2 w-2 rounded-full ${registered ? "animate-pulse bg-emerald-400" : "bg-amber-400"}`}
            />
            {registered ? "Voice ready" : "Voice not ready"}
          </div>
        </div>

        {pendingDisposition ? (
          <div className="rounded-2xl border border-amber-300/80 bg-amber-50/80 p-5 dark:border-amber-800/60 dark:bg-amber-950/30">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Call outcome</h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {pendingDisposition.phoneLabel || pendingDisposition.toNumber}
            </p>
            {showCreateLead ? (
              <form className="mt-4 space-y-3" onSubmit={onCreateLead}>
                <div>
                  <label className={labelClass}>First name *</label>
                  <input
                    className={inputClass}
                    value={leadFirstName}
                    onChange={(e) => setLeadFirstName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Notes</label>
                  <textarea
                    className={`${inputClass} min-h-[80px]`}
                    value={leadNotes}
                    onChange={(e) => setLeadNotes(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={savingDisposition}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {savingDisposition ? "Saving…" : "Create lead"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateLead(false);
                      setPendingDisposition(null);
                    }}
                    className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                  >
                    Skip
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {COLD_DISPOSITIONS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    disabled={savingDisposition}
                    onClick={() => void saveDisposition(d.id)}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {d.label}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={savingDisposition}
                  onClick={() => setShowCreateLead(true)}
                  className="rounded-lg border border-emerald-500 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200"
                >
                  Create lead
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5 rounded-2xl border border-white/80 bg-white/80 p-5 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
            <div>
              <label htmlFor="cold-dial-phone" className={labelClass}>
                Phone number *
              </label>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1 lg:max-w-xl">
                  <input
                    id="cold-dial-phone"
                    type="tel"
                    value={phone}
                    onChange={onPhoneChange}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (canPlaceCall) void onCall();
                      }
                    }}
                    placeholder="123-456-7890"
                    disabled={hasActiveCall}
                    maxLength={12}
                    className={`${phoneInputBase} ${
                      validation.isValid
                        ? "border-amber-300 focus:border-amber-500 focus:ring-amber-500/30 dark:border-zinc-700"
                        : "border-red-500/90 bg-red-50 dark:border-red-500/90"
                    }`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void onCall()}
                  disabled={!canPlaceCall}
                  className="inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-8 text-base font-semibold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Dialing…" : hasActiveCall ? "In call" : "Cold dial"}
                </button>
              </div>
              {validation.message ? (
                <p className="mt-2 text-xs text-zinc-500">{validation.message}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="cold-city" className={labelClass}>
                  City
                </label>
                <input
                  id="cold-city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={hasActiveCall}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="cold-state" className={labelClass}>
                  State
                </label>
                <input
                  id="cold-state"
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  disabled={hasActiveCall}
                  maxLength={32}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="cold-zip" className={labelClass}>
                  Zip code
                </label>
                <input
                  id="cold-zip"
                  type="text"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  disabled={hasActiveCall}
                  maxLength={16}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="cold-name" className={labelClass}>
                Contact name (optional)
              </label>
              <input
                id="cold-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={hasActiveCall}
                className={`${inputClass} max-w-md`}
              />
            </div>
          </div>
        )}

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
