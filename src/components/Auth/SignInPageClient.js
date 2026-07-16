"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sendWeb3FormsClient } from "@/lib/sendWeb3FormsClient";
import {
  consumeSignInNotice,
  signInNoticeMessage,
  stripSignInReasonFromUrl,
} from "@/lib/signInNotice";

export default function SignInPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState("signin");
  const [step, setStep] = useState("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    stripSignInReasonFromUrl();
    const reason = consumeSignInNotice();
    const message = signInNoticeMessage(reason);
    if (message) setNotice(message);
  }, []);

  useEffect(() => {
    if (searchParams.get("mode") === "leave") {
      setMode("leave");
    }
  }, [searchParams]);

  async function finishLogin(json, isLeaveMode) {
    if (!isLeaveMode && json.locationAlert?.subject && json.locationAlert?.message) {
      void sendWeb3FormsClient({
        subject: json.locationAlert.subject,
        message: json.locationAlert.message,
        replyTo: json.locationAlert.replyTo,
      });
    }
    router.push(json.redirect || (isLeaveMode ? "/leave-application" : "/"));
  }

  async function onSubmitCredentials(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const isLeaveMode = mode === "leave";

    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username,
          password,
          purpose: isLeaveMode ? "leave_application" : "full",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Sign-in failed");

      if (json.requires2fa) {
        setStep("totp");
        setTotpCode("");
        return;
      }

      await finishLogin(json, isLeaveMode);
    } catch (err) {
      setError(err.message || "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitTotp(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const isLeaveMode = mode === "leave";

    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          code: totpCode.trim(),
          rememberDevice,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Verification failed");

      await finishLogin(json, isLeaveMode);
    } catch (err) {
      setError(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  const isLeaveMode = mode === "leave";
  const isTotpStep = step === "totp";

  return (
    <div className="relative flex min-h-dvh w-full flex-col bg-gradient-to-b from-zinc-100 via-zinc-50 to-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgb(254 202 202 / 0.35), transparent)",
        }}
      />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:py-14">
        <div className="rounded-2xl border border-zinc-200/90 bg-white/90 p-8 shadow-lg shadow-zinc-200/50 ring-1 ring-zinc-950/5 backdrop-blur-sm">
          <div className="mb-8 flex items-center gap-2.5 text-lg font-semibold tracking-tight text-zinc-950">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600/10 text-red-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="h-6 w-6 shrink-0"
                fill="currentColor"
                aria-hidden
              >
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
              </svg>
            </span>
            <span>Dialer</span>
          </div>

          {!isTotpStep ? (
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  !isLeaveMode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("leave");
                  setError(null);
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  isLeaveMode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Leave application
              </button>
            </div>
          ) : null}

          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
            {isTotpStep
              ? "Authenticator code"
              : isLeaveMode
                ? "Apply for leave"
                : "Sign in"}
          </h1>
          <p className="mt-1.5 text-sm text-zinc-600 sm:text-base">
            {isTotpStep
              ? "Enter the 6-digit code from Google Authenticator."
              : isLeaveMode
                ? "Sign in to submit a leave application. Only the application form will be available."
                : "Enter your username and password to continue."}
          </p>

          {notice && !isTotpStep ? (
            <p
              className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800"
              role="status"
            >
              {notice}
            </p>
          ) : null}

          {isTotpStep ? (
            <form onSubmit={onSubmitTotp} className="mt-8 space-y-5">
              <div>
                <label
                  htmlFor="signin-totp"
                  className="mb-1.5 block text-sm font-medium text-zinc-800"
                >
                  Authentication code
                </label>
                <input
                  id="signin-totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]*"
                  maxLength={8}
                  className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3.5 text-center text-lg tracking-[0.35em] text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:tracking-normal placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-red-600/20"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/[^\d\s]/g, ""))}
                  placeholder="000000"
                  autoFocus
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-950 focus:ring-red-600/30"
                />
                <span className="text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Remember this browser for 7 days</span>
                  <span className="mt-0.5 block text-zinc-500">
                    Skip the authenticator code on this device until then.
                  </span>
                </span>
              </label>

              {error ? (
                <p
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading || totpCode.replace(/\s/g, "").length < 6}
                className="h-11 w-full rounded-lg bg-zinc-950 px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Verifying…" : "Verify and continue"}
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setStep("credentials");
                  setTotpCode("");
                  setError(null);
                }}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Back to sign in
              </button>
            </form>
          ) : (
            <form onSubmit={onSubmitCredentials} className="mt-8 space-y-5">
              <div>
                <label
                  htmlFor="signin-username"
                  className="mb-1.5 block text-sm font-medium text-zinc-800"
                >
                  Username
                </label>
                <input
                  id="signin-username"
                  className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-red-600/20"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>

              <div>
                <label
                  htmlFor="signin-password"
                  className="mb-1.5 block text-sm font-medium text-zinc-800"
                >
                  Password
                </label>
                <input
                  id="signin-password"
                  type="password"
                  className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-red-600/20"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {error ? (
                <p
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded-lg bg-zinc-950 px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? isLeaveMode
                    ? "Continuing…"
                    : "Signing in…"
                  : isLeaveMode
                    ? "Continue to leave application"
                    : "Sign in"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
