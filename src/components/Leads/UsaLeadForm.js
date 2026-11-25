"use client";

import { formatLandline } from "@/lib/phoneFormat";
import { SERVICE_TYPE_OPTIONS } from "@/lib/leadService";
import StateSelectField, { StateLocalTime } from "@/components/Leads/StateSelectField";
import RichTextField from "@/components/Leads/RichTextField";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";
const fieldErrorClass = "mt-1 text-xs font-medium text-red-600 dark:text-red-400";

function inputClassForValidation(baseClass, isValid) {
  if (isValid) return baseClass;
  return `${baseClass} border-red-400 focus:border-red-500 focus:ring-red-500/25 dark:border-red-500/70`;
}

export default function UsaLeadForm({
  selectsLeadSupervisor,
  formSupervisorId,
  setFormSupervisorId,
  sameShiftSupervisors,
  serviceType,
  setServiceType,
  cableName,
  setCableName,
  streamName,
  setStreamName,
  phone,
  setPhone,
  fullName,
  setFullName,
  cellNumber,
  setCellNumber,
  state,
  setState,
  city,
  setCity,
  zipCode,
  setZipCode,
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
      className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20"
    >
      <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">New lead</h3>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Service</label>
            <select
              value={serviceType}
              onChange={(e) => {
                const next = e.target.value;
                setServiceType(next);
                if (next !== "cable") setCableName("");
                if (next !== "streams") setStreamName("");
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
          {serviceType === "cable" ? (
            <div>
              <label className={labelClass}>Cable name</label>
              <input
                type="text"
                value={cableName}
                onChange={(e) => setCableName(e.target.value)}
                className={inputClass}
              />
            </div>
          ) : null}
          {serviceType === "streams" ? (
            <div>
              <label className={labelClass}>Stream name</label>
              <input
                type="text"
                value={streamName}
                onChange={(e) => setStreamName(e.target.value)}
                className={inputClass}
              />
            </div>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Phone *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                const formatted = formatLandline(e.target.value.replace(/[^\d*#+\-() ]/g, ""));
                setPhone(formatted);
                setSaveError(null);
              }}
              className={inputClassForValidation(
                inputClass,
                !phone.trim() || validation.phoneCheck.isValid,
              )}
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
                const formatted = formatLandline(e.target.value.replace(/[^\d*#+\-() ]/g, ""));
                setCellNumber(formatted);
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
        <div className="mt-1">
          <StateLocalTime stateCode={state} />
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
        className="mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save lead"}
      </button>
    </form>
  );
}
