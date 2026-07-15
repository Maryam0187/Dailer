"use client";

import { useCallback, useEffect, useState } from "react";

export default function SecurityClient() {
  const [status, setStatus] = useState({ totpEnabled: false, totpEnabledAt: null });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const [setup, setSetup] = useState(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);

  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [disableLoading, setDisableLoading] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/status", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load security status");
      setStatus({
        totpEnabled: json.totpEnabled === true,
        totpEnabledAt: json.totpEnabledAt ?? null,
      });
    } catch (err) {
      setError(err.message || "Failed to load security status");
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function startSetup() {
    setError(null);
    setMessage(null);
    setSetupLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/setup/start", {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to start setup");
      setSetup({
        qrDataUrl: json.qrDataUrl,
        manualKey: json.manualKey,
      });
      setSetupCode("");
    } catch (err) {
      setError(err.message || "Failed to start setup");
    } finally {
      setSetupLoading(false);
    }
  }

  async function confirmSetup(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSetupLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/setup/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: setupCode.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to enable two-factor authentication");
      setSetup(null);
      setSetupCode("");
      setMessage("Two-factor authentication is now enabled. You will need your authenticator code at sign-in.");
      await refreshStatus();
    } catch (err) {
      setError(err.message || "Failed to enable two-factor authentication");
    } finally {
      setSetupLoading(false);
    }
  }

  async function disableTotp(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setDisableLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          password: disablePassword,
          code: disableCode.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to disable two-factor authentication");
      setDisablePassword("");
      setDisableCode("");
      setMessage("Two-factor authentication has been disabled.");
      await refreshStatus();
    } catch (err) {
      setError(err.message || "Failed to disable two-factor authentication");
    } finally {
      setDisableLoading(false);
    }
  }

  const inputClass =
    "h-11 w-full rounded-lg border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
  const labelClass = "mb-1.5 block text-sm font-medium text-zinc-800 dark:text-zinc-200";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {loadingStatus ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Status</p>
          <p className="mt-2 text-base text-zinc-950 dark:text-zinc-50">
            {status.totpEnabled ? (
              <>
                Two-factor authentication is <span className="font-semibold text-emerald-700 dark:text-emerald-400">enabled</span>
                {status.totpEnabledAt ? (
                  <span className="block text-sm font-normal text-zinc-500 dark:text-zinc-400">
                    Since {new Date(status.totpEnabledAt).toLocaleString()}
                  </span>
                ) : null}
              </>
            ) : (
              <>
                Two-factor authentication is <span className="font-semibold text-zinc-600 dark:text-zinc-300">off</span>
              </>
            )}
          </p>
        </div>
      )}

      {error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {message ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          role="status"
        >
          {message}
        </p>
      ) : null}

      {!status.totpEnabled ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Enable authenticator</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Scan the QR code with Google Authenticator, then enter the 6-digit code to confirm.
          </p>

          {!setup ? (
            <button
              type="button"
              disabled={setupLoading || loadingStatus}
              onClick={() => void startSetup()}
              className="mt-5 h-11 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            >
              {setupLoading ? "Preparing…" : "Set up Google Authenticator"}
            </button>
          ) : (
            <div className="mt-5 space-y-5">
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={setup.qrDataUrl}
                  alt="Authenticator QR code"
                  className="h-[220px] w-[220px] rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-700"
                />
                <div className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-center dark:border-zinc-700 dark:bg-zinc-900">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Manual key</p>
                  <p className="mt-1 break-all font-mono text-sm text-zinc-900 dark:text-zinc-100">
                    {setup.manualKey}
                  </p>
                </div>
              </div>

              <form onSubmit={confirmSetup} className="space-y-4">
                <div>
                  <label htmlFor="setup-code" className={labelClass}>
                    Confirmation code
                  </label>
                  <input
                    id="setup-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    className={inputClass}
                    value={setupCode}
                    onChange={(e) => setSetupCode(e.target.value.replace(/[^\d\s]/g, ""))}
                    placeholder="000000"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={setupLoading || setupCode.replace(/\s/g, "").length < 6}
                    className="h-11 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {setupLoading ? "Enabling…" : "Confirm and enable"}
                  </button>
                  <button
                    type="button"
                    disabled={setupLoading}
                    onClick={() => {
                      setSetup(null);
                      setSetupCode("");
                    }}
                    className="h-11 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Disable authenticator</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Enter your password and a current authenticator code to turn off two-factor authentication.
          </p>
          <form onSubmit={disableTotp} className="mt-5 space-y-4">
            <div>
              <label htmlFor="disable-password" className={labelClass}>
                Password
              </label>
              <input
                id="disable-password"
                type="password"
                autoComplete="current-password"
                className={inputClass}
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="disable-code" className={labelClass}>
                Authentication code
              </label>
              <input
                id="disable-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                className={inputClass}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/[^\d\s]/g, ""))}
                placeholder="000000"
              />
            </div>
            <button
              type="submit"
              disabled={
                disableLoading ||
                !disablePassword ||
                disableCode.replace(/\s/g, "").length < 6
              }
              className="h-11 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
            >
              {disableLoading ? "Disabling…" : "Disable two-factor authentication"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
