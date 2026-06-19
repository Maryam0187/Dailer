"use client";

import { useEffect, useMemo, useState } from "react";
import { digitsOnly, formatLandline, validatePhone } from "@/lib/phoneFormat";
import { formatLeadPhoneDisplay } from "@/lib/maskPhone";
import { SERVICE_TYPE_OPTIONS } from "@/lib/leadService";
import StateSelectField, { StateLocalTime } from "@/components/Leads/StateSelectField";

const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";
const readOnlyClass =
  "w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3.5 py-2.5 text-sm font-mono text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400";
const fieldErrorClass = "mt-1 text-xs font-medium text-red-600 dark:text-red-400";

function inputClassForValidation(baseClass, isValid) {
  if (isValid) return baseClass;
  return `${baseClass} border-red-400 focus:border-red-500 focus:ring-red-500/25 dark:border-red-500/70`;
}

function leadToForm(lead, phonesRedacted) {
  return {
    fullName: lead?.fullName || "",
    cellNumber:
      lead?.cellNumber && !phonesRedacted ? formatLandline(lead.cellNumber) : "",
    city: lead?.city || "",
    state: lead?.state || "",
    zipCode: lead?.zipCode || "",
    serviceType: lead?.serviceType || "",
    cableName: lead?.cableName || "",
    streamName: lead?.streamName || "",
  };
}

export default function LeadEditModal({ lead, phonesRedacted = false, onClose, onSaved }) {
  const [form, setForm] = useState(() => leadToForm(lead, phonesRedacted));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    setForm(leadToForm(lead, phonesRedacted));
    setSaveError(null);
  }, [lead?.id, lead?.updatedAt, phonesRedacted]);

  const validation = useMemo(() => {
    const cellCheck = form.cellNumber.trim() ? validatePhone(form.cellNumber) : { isValid: true, message: "" };
    return {
      cellCheck,
      canSave: cellCheck.isValid && Boolean(form.fullName.trim()),
    };
  }, [form.cellNumber, form.fullName]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveError(null);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!validation.canSave || !lead?.id) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zipCode: form.zipCode.trim() || null,
        serviceType: form.serviceType || null,
        cableName: form.serviceType === "cable" ? form.cableName.trim() || null : null,
        streamName: form.serviceType === "streams" ? form.streamName.trim() || null : null,
      };
      if (!phonesRedacted) {
        payload.cellNumber = form.cellNumber.trim() ? digitsOnly(form.cellNumber) : null;
      }
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Update failed");
      onSaved?.(json.lead);
    } catch (err) {
      setSaveError(err.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  if (!lead) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-zinc-950/50 backdrop-blur-[2px]"
        aria-label="Close edit lead"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-labelledby="edit-lead-title"
          className="flex max-h-[min(90vh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
        >
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 id="edit-lead-title" className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              Edit lead
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Phone number cannot be changed.</p>
          </div>

          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5">
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Service</label>
                  <select
                    value={form.serviceType}
                    onChange={(e) => {
                      const next = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        serviceType: next,
                        cableName: next === "cable" ? prev.cableName : "",
                        streamName: next === "streams" ? prev.streamName : "",
                      }));
                      setSaveError(null);
                    }}
                    className={inputClass}
                  >
                    <option value="">Select service</option>
                    {SERVICE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {form.serviceType === "cable" ? (
                  <div>
                    <label className={labelClass}>Cable name</label>
                    <input
                      type="text"
                      value={form.cableName}
                      onChange={(e) => setField("cableName", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                ) : null}
                {form.serviceType === "streams" ? (
                  <div>
                    <label className={labelClass}>Stream name</label>
                    <input
                      type="text"
                      value={form.streamName}
                      onChange={(e) => setField("streamName", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Phone</label>
                  <div className={readOnlyClass} aria-readonly="true">
                    {formatLeadPhoneDisplay(lead.phone, phonesRedacted)}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Full name *</label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(e) => setField("fullName", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              {!phonesRedacted ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Cell number</label>
                    <input
                      type="tel"
                      value={form.cellNumber}
                      onChange={(e) => {
                        const formatted = formatLandline(e.target.value.replace(/[^\d*#+\-() ]/g, ""));
                        setField("cellNumber", formatted);
                      }}
                      className={inputClassForValidation(
                        inputClass,
                        !form.cellNumber.trim() || validation.cellCheck.isValid,
                      )}
                      aria-invalid={Boolean(form.cellNumber.trim()) && !validation.cellCheck.isValid}
                    />
                    {form.cellNumber.trim() && !validation.cellCheck.isValid ? (
                      <p className={fieldErrorClass}>{validation.cellCheck.message}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-3">
                <StateSelectField
                  value={form.state}
                  onChange={(value) => setField("state", value)}
                  disabled={saving}
                  showLocalTime={false}
                />
                <div>
                  <label className={labelClass}>City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setField("city", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Zip code</label>
                  <input
                    type="text"
                    value={form.zipCode}
                    onChange={(e) => setField("zipCode", e.target.value)}
                    className={inputClass}
                    maxLength={16}
                  />
                </div>
              </div>
              <div className="-mt-2">
                <StateLocalTime stateCode={form.state} />
              </div>
            </div>

            {saveError ? <p className={`mt-4 ${fieldErrorClass}`}>{saveError}</p> : null}

            <div className="mt-5 flex justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !validation.canSave}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
