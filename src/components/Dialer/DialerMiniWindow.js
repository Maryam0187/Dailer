"use client";

import { useState } from "react";

export default function DialerMiniWindow() {
  const [toNumber, setToNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function onDial() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ toNumber }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Dial failed");

      // Keep it simple: refresh the page so call logs update.
      window.location.reload();
    } catch (e) {
      setError(e.message || "Dial failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed right-4 top-20 z-40 w-[320px] rounded-xl bg-white p-4 shadow-lg ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
          Dialer
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          Mini window (records call in CallLogs).
        </p>
      </div>

      <label className="mb-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200">
        Number
      </label>
      <input
        value={toNumber}
        onChange={(e) => setToNumber(e.target.value)}
        placeholder="e.g. 15551234567"
        className="mb-3 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />

      {error ? <p className="mb-2 text-xs font-medium text-red-600">{error}</p> : null}

      <button
        onClick={onDial}
        disabled={loading || !toNumber.trim()}
        className="h-10 w-full rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-white"
      >
        {loading ? "Dialing..." : "Dial"}
      </button>
    </div>
  );
}

