"use client";

import { useState } from "react";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { startOutgoingCall } from "@/lib/startOutgoingCall";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";
import { digitsOnly, formatLandline, validatePhone } from "@/lib/phoneFormat";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

export default function QuickDialPanel() {
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
  const [validation, setValidation] = useState({ isValid: true, message: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const hasActiveCall = Boolean(session);
  // Only the primary tab in this browser may place calls. Secondary tabs are
  // hard-disabled here; the takeover affordance lives in the banner.
  const canStartCall =
    isPrimaryTab !== false && (registered || voiceDisplaced) && !sdkInitializing;
  const canPlaceCall =
    Boolean(phone.trim()) &&
    validation.isValid &&
    !loading &&
    !hasActiveCall &&
    canStartCall;

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

  function onPhoneKeyDown(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!canPlaceCall) return;
    void onCall();
  }

  async function onCall() {
    const v = validatePhone(phone);
    setValidation(v);
    if (!v.isValid || hasActiveCall) return;
    const toDigits = digitsOnly(phone);
    setLoading(true);
    setError(null);
    try {
      expectOutgoingIncomingLeg(45000);
      // Ensure the browser agent is ready before starting the outbound call.
      // Otherwise Twilio may dial a not-yet-registered <Client> identity.
      if (!registered) {
        await ensureRegistered();
      } else if (sdkInitializing) {
        await ensureRegistered();
      }

      const result = await startOutgoingCall(toDigits);
      if (!result.ok) throw new Error(result.error);
      beginSession({
        callId: result.call.id,
        callOwnedByMe: true,
        callMode: result.callMode || "direct",
        toNumber: result.call.toNumber,
        phoneLabel: phone.trim() || formatLandline(toDigits),
        customerName: name.trim() || undefined,
        conferenceName: result.conferenceName || undefined,
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
    <section className="relative overflow-hidden rounded-3xl border border-sky-200/90 bg-gradient-to-br from-white via-sky-50/50 to-indigo-50/45 shadow-2xl shadow-sky-500/15 ring-1 ring-sky-300/40 dark:border-sky-900/50 dark:from-zinc-900 dark:via-zinc-900 dark:to-sky-950/25 dark:shadow-sky-950/35 dark:ring-sky-500/20">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-sky-400/20 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 top-10 h-48 w-48 rounded-full bg-sky-400/20 blur-3xl"
        aria-hidden
      />
      <div className="relative p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-sky-200/80 pb-4 dark:border-zinc-800">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700/80 dark:text-sky-300/80">
              Outbound Console
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">Dialer</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <span
              className={`h-2 w-2 animate-pulse rounded-full ${
                registered ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            {registered ? "Voice Ready" : "Voice Not Ready"}
          </div>
        </div>

        <div className="space-y-5 rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_10px_30px_rgba(56,189,248,0.12)] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-none">
          <div>
            <label htmlFor="dial-phone" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
              Phone number
            </label>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1 lg:max-w-xl">
                <input
                  id="dial-phone"
                  type="tel"
                  value={phone}
                  onChange={onPhoneChange}
                  onPaste={onPhonePaste}
                  onKeyDown={onPhoneKeyDown}
                  placeholder="123-456-7890"
                  disabled={hasActiveCall}
                  maxLength={12}
                  className={`${phoneInputBase} ${
                    validation.isValid
                      ? "border-sky-300 bg-white text-zinc-900 focus:border-sky-500 focus:ring-sky-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-cyan-400 dark:focus:ring-cyan-500/30"
                      : "border-red-500/90 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-500/25 dark:border-red-500/90 dark:bg-red-950/30 dark:text-red-100"
                  }`}
                />
              </div>
              <button
                type="button"
                onClick={onCall}
                disabled={!canPlaceCall}
                className="inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-8 text-base font-semibold text-white shadow-lg shadow-sky-500/30 transition-all duration-200 hover:-translate-y-0.5 hover:from-sky-600 hover:to-indigo-600 hover:shadow-sky-500/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:bg-none disabled:text-zinc-500 disabled:shadow-none dark:disabled:bg-zinc-700 dark:disabled:text-zinc-300"
              >
                {loading ? (
                  <span
                    className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
                    aria-hidden
                  />
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                )}
                {hasActiveCall
                  ? "In call"
                  : isPrimaryTab === false
                    ? "Active in other tab"
                    : voiceDisplaced
                      ? "Use this tab"
                      : !canStartCall
                        ? "Voice Not Ready"
                        : loading
                          ? "Dialing..."
                          : "Start Call"}
              </button>
            </div>
            <div className="mt-2 min-h-[1.25rem]">
              {validation.message ? (
                <p
                  className={`text-xs ${
                    validation.isValid ? "text-zinc-500 dark:text-zinc-400" : "font-medium text-red-600 dark:text-red-300"
                  }`}
                >
                  {validation.message}
                </p>
              ) : null}
            </div>
          </div>

          {error ? (
            <p
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="border-t border-zinc-200/80 pt-4 dark:border-zinc-800">
            <label
              htmlFor="dial-name"
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300"
            >
              Contact name (optional)
            </label>
            <input
              id="dial-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              disabled={hasActiveCall}
              className="max-w-md w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-cyan-400 dark:focus:ring-cyan-500/20"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
