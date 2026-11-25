"use client";

import { useEffect, useMemo, useState } from "react";
import { digitsOnly, formatCanadaPhone, formatLandline, validatePhone } from "@/lib/phoneFormat";
import { formatLeadPhoneDisplay } from "@/lib/maskPhone";
import { CANADA_SERVICE_OPTIONS, SERVICE_TYPE_OPTIONS } from "@/lib/leadService";
import StateSelectField, { StateLocalTime } from "@/components/Leads/StateSelectField";
import { CA_PROVINCES, formatCanadianPostal, getProvinceByCode, validateCanadianPostal } from "@/lib/caProvinces";
import { formatStateLocalTime } from "@/lib/usStates";

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
  const isCanada = lead?.country === "canada";
  const formatPhone = isCanada ? formatCanadaPhone : formatLandline;
  return {
    fullName: lead?.fullName || "",
    cellNumber: lead?.cellNumber && !phonesRedacted ? formatPhone(lead.cellNumber) : "",
    city: lead?.city || "",
    state: lead?.state || "",
    zipCode: isCanada ? formatCanadianPostal(lead?.zipCode) : lead?.zipCode || "",
    serviceType: lead?.serviceType || "",
    cableName: lead?.cableName || "",
    streamName: lead?.streamName || "",
  };
}

function ProvinceLocalTime({ provinceCode }) {
  const [now, setNow] = useState(() => new Date());
  const selected = useMemo(() => getProvinceByCode(provinceCode), [provinceCode]);

  useEffect(() => {
    if (!selected?.timeZone) return undefined;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [selected?.timeZone]);

  if (!selected) {
    return <p className="text-xs text-zinc-500 dark:text-zinc-400">Select a province to see local time.</p>;
  }

  return (
    <p className="text-xs font-medium text-red-700 dark:text-red-300" aria-live="polite">
      Local time in {selected.name}: {formatStateLocalTime(selected.timeZone, now)}
    </p>
  );
}

export default function LeadEditModal({ lead, phonesRedacted = false, onClose, onSaved }) {
  const [form, setForm] = useState(() => leadToForm(lead, phonesRedacted));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    setForm(leadToForm(lead, phonesRedacted));
    setSaveError(null);
  }, [lead?.id, lead?.updatedAt, phonesRedacted]);

  const isCanada = lead?.country === "canada";
  const serviceOptions = isCanada ? CANADA_SERVICE_OPTIONS : SERVICE_TYPE_OPTIONS;

  const validation = useMemo(() => {
    const cellCheck = form.cellNumber.trim() ? validatePhone(form.cellNumber) : { isValid: true, message: "" };
    const postalCheck = isCanada ? validateCanadianPostal(form.zipCode) : { isValid: true, message: "" };
    return {
      cellCheck,
      postalCheck,
      canSave: cellCheck.isValid && postalCheck.isValid && Boolean(form.fullName.trim()),
    };
  }, [form.cellNumber, form.fullName, form.zipCode, isCanada]);

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
        zipCode: isCanada
          ? formatCanadianPostal(form.zipCode).trim() || null
          : form.zipCode.trim() || null,
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
              {isCanada ? "Edit Canada lead" : "Edit lead"}
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
                    {serviceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {form.serviceType === "cable" && !isCanada ? (
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
                {form.serviceType === "streams" && !isCanada ? (
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
                      const formatted = (isCanada ? formatCanadaPhone : formatLandline)(
                        e.target.value.replace(/[^\d*#+\-() ]/g, ""),
                      );
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
                {isCanada ? (
                  <div>
                    <label className={labelClass}>Province</label>
                    <select
                      value={form.state}
                      onChange={(e) => setField("state", e.target.value)}
                      disabled={saving}
                      className={inputClass}
                    >
                      <option value="">Select province…</option>
                      {CA_PROVINCES.map((province) => (
                        <option key={province.code} value={province.code}>
                          {province.name} ({province.code})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <StateSelectField
                    value={form.state}
                    onChange={(value) => setField("state", value)}
                    disabled={saving}
                    showLocalTime={false}
                  />
                )}
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
                  <label className={labelClass}>{isCanada ? "Postal code" : "Zip code"}</label>
                  <input
                    type="text"
                    value={form.zipCode}
                    onChange={(e) =>
                      setField(
                        "zipCode",
                        isCanada ? formatCanadianPostal(e.target.value) : e.target.value,
                      )
                    }
                    className={inputClassForValidation(
                      inputClass,
                      !isCanada || validation.postalCheck.isValid,
                    )}
                    maxLength={isCanada ? 7 : 16}
                    placeholder={isCanada ? "A1A 1A1" : undefined}
                    aria-invalid={isCanada && !validation.postalCheck.isValid}
                  />
                  {isCanada && form.zipCode.trim() && !validation.postalCheck.isValid ? (
                    <p className={fieldErrorClass}>{validation.postalCheck.message}</p>
                  ) : null}
                </div>
              </div>
              <div className="-mt-2">
                {isCanada ? <ProvinceLocalTime provinceCode={form.state} /> : <StateLocalTime stateCode={form.state} />}
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
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                  isCanada ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
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
