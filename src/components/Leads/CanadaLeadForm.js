"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCanadaPhone } from "@/lib/phoneFormat";
import { CANADA_SERVICE_OPTIONS } from "@/lib/leadService";
import { CA_PROVINCES, formatCanadianPostal, getProvinceByCode } from "@/lib/caProvinces";
import { formatStateLocalTime } from "@/lib/usStates";
import RichTextField from "@/components/Leads/RichTextField";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-red-500/80 focus:ring-2 focus:ring-red-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";
const fieldErrorClass = "mt-1 text-xs font-medium text-red-600 dark:text-red-400";

function inputClassForValidation(baseClass, isValid) {
  if (isValid) return baseClass;
  return `${baseClass} border-red-400 focus:border-red-500 focus:ring-red-500/25 dark:border-red-500/70`;
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
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Select a province to see local time.</p>
    );
  }

  const localTime = formatStateLocalTime(selected.timeZone, now);
  return (
    <p className="text-xs font-medium text-red-700 dark:text-red-300" aria-live="polite">
      Local time in {selected.name}: {localTime}
    </p>
  );
}

export default function CanadaLeadForm({
  selectsLeadSupervisor,
  formSupervisorId,
  setFormSupervisorId,
  sameShiftSupervisors,
  serviceType,
  setServiceType,
  phone,
  setPhone,
  fullName,
  setFullName,
  cellNumber,
  setCellNumber,
  province,
  setProvince,
  city,
  setCity,
  postalCode,
  setPostalCode,
  breakdown,
  setBreakdown,
  notes,
  setNotes,
  saving,
  saveError,
  setSaveError,
  validation,
  onSubmit,
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-red-200/80 bg-red-50/40 p-5 dark:border-red-900/50 dark:bg-red-950/20"
    >
      <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">New Canada lead</h3>
      <div className="grid gap-4">
        {selectsLeadSupervisor ? (
          <div>
            <label className={labelClass}>Supervisor (optional)</label>
            <select
              value={formSupervisorId}
              onChange={(e) => setFormSupervisorId(e.target.value)}
              className={inputClass}
            >
              <option value="">Unassigned — pick later</option>
              {sameShiftSupervisors.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.username}
                  {s.role === "lead_supervisor" ? " (Lead supervisor)" : " (Supervisor)"}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {CANADA_SERVICE_OPTIONS.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Service</label>
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                className={inputClass}
              >
                <option value="">Select service</option>
                {CANADA_SERVICE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Phone *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(formatCanadaPhone(e.target.value.replace(/[^\d*#+\-() ]/g, "")));
                setSaveError(null);
              }}
              className={inputClassForValidation(inputClass, !phone.trim() || validation.phoneCheck.isValid)}
              aria-invalid={Boolean(phone.trim()) && !validation.phoneCheck.isValid}
            />
            {phone.trim() && !validation.phoneCheck.isValid ? (
              <p className={fieldErrorClass}>{validation.phoneCheck.message}</p>
            ) : null}
          </div>
          <div>
            <label className={labelClass}>Full name *</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setSaveError(null);
              }}
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Cell number</label>
            <input
              type="tel"
              value={cellNumber}
              onChange={(e) => {
                setCellNumber(formatCanadaPhone(e.target.value.replace(/[^\d*#+\-() ]/g, "")));
                setSaveError(null);
              }}
              className={inputClassForValidation(
                inputClass,
                !cellNumber.trim() || validation.cellCheck.isValid,
              )}
              aria-invalid={Boolean(cellNumber.trim()) && !validation.cellCheck.isValid}
            />
            {cellNumber.trim() && !validation.cellCheck.isValid ? (
              <p className={fieldErrorClass}>{validation.cellCheck.message}</p>
            ) : null}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="lead-province" className={labelClass}>
              Province
            </label>
            <select
              id="lead-province"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              disabled={saving}
              className={inputClass}
            >
              <option value="">Select province…</option>
              {CA_PROVINCES.map((provinceOption) => (
                <option key={provinceOption.code} value={provinceOption.code}>
                  {provinceOption.name} ({provinceOption.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>City</label>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Postal code</label>
            <input
              type="text"
              value={postalCode}
              onChange={(e) => {
                setPostalCode(formatCanadianPostal(e.target.value));
                setSaveError(null);
              }}
              className={inputClassForValidation(
                inputClass,
                !postalCode.trim() || validation.postalCheck.isValid,
              )}
              aria-invalid={Boolean(postalCode.trim()) && !validation.postalCheck.isValid}
              maxLength={7}
              placeholder="A1A 1A1"
            />
            {postalCode.trim() && !validation.postalCheck.isValid ? (
              <p className={fieldErrorClass}>{validation.postalCheck.message}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-1">
          <ProvinceLocalTime provinceCode={province} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <RichTextField
            label="Breakdown / Processing Notes"
            labelClass={labelClass}
            value={breakdown}
            onChange={setBreakdown}
            disabled={saving}
            placeholder="Add breakdown details…"
          />
          <RichTextField
            label="Note"
            labelClass={labelClass}
            value={notes}
            onChange={setNotes}
            disabled={saving}
            placeholder="Add a note…"
          />
        </div>
      </div>
      {saveError ? <p className={`mt-4 ${fieldErrorClass}`}>{saveError}</p> : null}
      <button
        type="submit"
        disabled={saving || !validation.canSave}
        className="mt-4 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save lead"}
      </button>
    </form>
  );
}
