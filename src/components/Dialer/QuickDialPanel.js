"use client";

import { useState } from "react";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { startOutgoingCall } from "@/lib/startOutgoingCall";
import { digitsOnly, formatLandline, validatePhone } from "@/lib/phoneFormat";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

export default function QuickDialPanel() {
  const { session, beginSession } = useActiveCall();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [validation, setValidation] = useState({ isValid: true, message: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const hasActiveCall = Boolean(session);

  function onPhoneChange(e) {
    const v = e.target.value.replace(/[^\d*#+\-() ]/g, "");
    const formatted = formatLandline(v);
    setPhone(formatted);
    setValidation(validatePhone(formatted));
    setError(null);
  }

  function onPhonePaste(e) {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData)?.getData("text") || "";
    const cleaned = pasted.replace(/[^\d*#+\-() ]/g, "");
    const formatted = formatLandline(cleaned);
    setPhone(formatted);
    setValidation(validatePhone(formatted));
    setError(null);
  }

  async function onCall() {
    const v = validatePhone(phone);
    setValidation(v);
    if (!v.isValid || hasActiveCall) return;
    const toDigits = digitsOnly(phone);
    setLoading(true);
    setError(null);
    try {
      const result = await startOutgoingCall(toDigits);
      if (!result.ok) throw new Error(result.error);
      beginSession({
        callId: result.call.id,
        toNumber: result.call.toNumber,
        phoneLabel: phone.trim() || formatLandline(toDigits),
        customerName: name.trim() || undefined,
      });
      setPhone("");
      setName("");
      setValidation({ isValid: true, message: "" });
    } catch (e) {
      setError(e.message || "Dial failed");
    } finally {
      setLoading(false);
    }
  }

  const phoneInputBase =
    "w-full rounded-xl border-2 px-5 py-4 font-mono text-xl text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-500 focus:ring-2 focus:ring-offset-0 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:focus:ring-offset-0";

  return (
    <section className="relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-br from-white via-zinc-50/50 to-red-50/25 shadow-lg shadow-zinc-200/40 ring-1 ring-zinc-950/[0.04] dark:border-zinc-700/80 dark:from-zinc-900 dark:via-zinc-900 dark:to-red-950/15 dark:shadow-none dark:ring-white/5">
      <div
        className="pointer-events-none absolute -right-8 -top-12 h-48 w-48 rounded-full bg-red-500/10 blur-3xl dark:bg-red-500/5"
        aria-hidden
      />
      <div className="relative p-6 sm:p-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-white shadow-md shadow-red-600/30">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-6 w-6"
                aria-hidden
              >
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-2xl">
                Dialing
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Enter a number and optional contact name, then start the call. Outbound calls are logged
                automatically.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1 lg:max-w-xl">
              <label htmlFor="dial-phone" className={labelClass}>
                Phone number <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input
                id="dial-phone"
                type="tel"
                value={phone}
                onChange={onPhoneChange}
                onPaste={onPhonePaste}
                placeholder="Paste or type number"
                disabled={hasActiveCall}
                className={`${phoneInputBase} ${
                  validation.isValid
                    ? "border-sky-400/80 bg-sky-50/80 focus:border-sky-500 focus:ring-sky-500/30 dark:border-sky-600/60 dark:bg-sky-950/35 dark:focus:border-sky-500 dark:focus:ring-sky-400/25"
                    : "border-red-400 bg-red-50/80 focus:border-red-500 focus:ring-red-500/25 dark:border-red-500 dark:bg-red-950/30 dark:focus:ring-red-400/25"
                }`}
              />
              {validation.message ? (
                <p
                  className={`mt-1.5 text-xs ${validation.isValid ? "text-zinc-500 dark:text-zinc-400" : "font-medium text-red-600 dark:text-red-400"}`}
                >
                  {validation.message}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onCall}
              disabled={!phone.trim() || !validation.isValid || loading || hasActiveCall}
              className="inline-flex h-14 shrink-0 items-center justify-center gap-2.5 rounded-xl bg-emerald-600 px-8 text-base font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:shadow-none dark:disabled:bg-zinc-600 lg:self-end"
            >
              {loading ? (
                <span
                  className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden
                />
              ) : (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
              )}
              {hasActiveCall ? "Call in progress" : loading ? "Connecting…" : "Call"}
            </button>
          </div>

          {error ? (
            <p
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="border-t border-zinc-200/80 pt-5 dark:border-zinc-700/80">
            <label htmlFor="dial-name" className={labelClass}>
              Name <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
            </label>
            <input
              id="dial-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Shown on the active call card"
              disabled={hasActiveCall}
              className="max-w-md w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-red-400/80 focus:ring-2 focus:ring-red-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-red-500/60 dark:focus:ring-red-400/15"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
