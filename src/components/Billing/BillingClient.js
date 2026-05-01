"use client";

import { useEffect, useState } from "react";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

function money(value, currency) {
  const num = Number(value || 0);
  return `${currency} ${num.toFixed(2)}`;
}

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getPresetRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === "today") {
    return { from: formatDateInput(today), to: formatDateInput(today) };
  }
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { from: formatDateInput(y), to: formatDateInput(y) };
  }
  if (preset === "week") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: formatDateInput(from), to: formatDateInput(today) };
  }
  if (preset === "month") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: formatDateInput(from), to: formatDateInput(today) };
  }
  return { from: "", to: "" };
}

export default function BillingClient() {
  const [fixedMarkupPerCall, setFixedMarkupPerCall] = useState("0.00");
  const [currency, setCurrency] = useState("USD");
  const [rangePreset, setRangePreset] = useState("today");
  const initialRange = getPresetRange("today");
  const [rangeFrom, setRangeFrom] = useState(initialRange.from);
  const [rangeTo, setRangeTo] = useState(initialRange.to);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [billPreview, setBillPreview] = useState(null);
  const [billResult, setBillResult] = useState(null);
  const [billHistory, setBillHistory] = useState([]);

  async function loadData() {
    setError(null);
    try {
      const [settingsRes, billsRes] = await Promise.all([
        fetch("/api/billing/settings", { credentials: "include" }),
        fetch("/api/billing/bills", { credentials: "include" }),
      ]);
      const settingsJson = await settingsRes.json().catch(() => ({}));
      const billsJson = await billsRes.json().catch(() => ({}));
      if (!settingsRes.ok) throw new Error(settingsJson?.error || "Failed to load settings");
      if (!billsRes.ok) throw new Error(billsJson?.error || "Failed to load bills");

      setFixedMarkupPerCall(String(settingsJson.settings?.fixedMarkupPerCall ?? "0.00"));
      setCurrency(String(settingsJson.settings?.currency ?? "USD"));
      setBillHistory(billsJson.bills || []);
    } catch (err) {
      setError(err.message || "Failed to load billing data");
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function onSaveSettings(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/billing/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fixedMarkupPerCall: Number(fixedMarkupPerCall) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save settings");
      setFixedMarkupPerCall(String(json.settings.fixedMarkupPerCall));
      setCurrency(json.settings.currency || "USD");
    } catch (err) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(preset) {
    setRangePreset(preset);
    if (preset === "custom") {
      setBillPreview(null);
      setBillResult(null);
      return;
    }
    const next = getPresetRange(preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
    setBillPreview(null);
    setBillResult(null);
  }

  async function onPreviewBill(e) {
    e.preventDefault();
    setError(null);
    setPreviewing(true);
    setBillResult(null);
    setBillPreview(null);
    try {
      const res = await fetch("/api/billing/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fromDate: rangeFrom, toDate: rangeTo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to preview bill");
      setBillPreview(json.preview);
    } catch (err) {
      setError(err.message || "Failed to preview bill");
    } finally {
      setPreviewing(false);
    }
  }

  async function onGenerateBill() {
    if (!billPreview) return;
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/billing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fromDate: rangeFrom, toDate: rangeTo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to generate bill");
      setBillResult(json.bill);
      setBillPreview(null);
      setBillHistory((prev) => {
        const next = [json.bill, ...prev.filter((b) => b.id !== json.bill.id)];
        return next.slice(0, 50);
      });
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to generate bill");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-8">
      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm dark:border-sky-900/40 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Markup settings</h2>
        <form className="mt-4 flex flex-col gap-4 sm:max-w-md" onSubmit={onSaveSettings}>
          <div>
            <label htmlFor="fixed-markup" className={labelClass}>
              Fixed markup per call ({currency})
            </label>
            <input
              id="fixed-markup"
              type="number"
              step="0.01"
              min="0"
              value={fixedMarkupPerCall}
              onChange={(e) => setFixedMarkupPerCall(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save settings"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Generate bill</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={onPreviewBill}>
          <div className="sm:col-span-3">
            <label className={labelClass}>Range presets</label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "today", label: "Today Bill" },
                { id: "yesterday", label: "Yesterday" },
                { id: "week", label: "Week" },
                { id: "month", label: "Month" },
                { id: "custom", label: "Custom" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                    rangePreset === p.id
                      ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="from-date" className={labelClass}>
              From date
            </label>
            <input
              id="from-date"
              type="date"
              className={inputClass}
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="to-date" className={labelClass}>
              To date
            </label>
            <input
              id="to-date"
              type="date"
              className={inputClass}
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              required
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={previewing || generating}
              className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {previewing ? "Previewing..." : "Preview bill"}
            </button>
          </div>
        </form>

        {billPreview ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <p className="text-sm text-zinc-700 dark:text-zinc-200">
              Preview: {new Date(billPreview.fromDate).toLocaleDateString()} -{" "}
              {new Date(billPreview.toDate).toLocaleDateString()} | Calls:{" "}
              <span className="font-semibold">{billPreview.totalCalls}</span> | Total:{" "}
              <span className="font-semibold">
                {money(billPreview.totalAmount, billPreview.currency)}
              </span>
            </p>
            <div className="mt-3 grid gap-1 text-sm text-zinc-700 dark:text-zinc-200">
              <p>Twilio base: {money(billPreview.twilioBaseAmount, billPreview.currency)}</p>
              <p>Markup total: {money(billPreview.markupAmount, billPreview.currency)}</p>
              <p>Fixed markup per call: {money(billPreview.fixedMarkupPerCall, billPreview.currency)}</p>
            </div>
            <button
              type="button"
              onClick={onGenerateBill}
              disabled={generating}
              className="mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {generating ? "Generating PDF..." : "Generate PDF"}
            </button>

            <div className="mt-5 overflow-x-auto rounded-xl border border-emerald-200/80 bg-white/80 p-3 dark:border-emerald-900/40 dark:bg-zinc-900/70">
              <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Preview logs ({billPreview.lines?.length || 0})
              </h3>
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    <th className="py-2 pr-3">Call SID</th>
                    <th className="py-2 pr-3">To</th>
                    <th className="py-2 pr-3">From</th>
                    <th className="py-2 pr-3">Duration</th>
                    <th className="py-2 pr-3">Twilio</th>
                    <th className="py-2 pr-3">Markup</th>
                    <th className="py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(billPreview.lines || []).map((line) => (
                    <tr
                      key={line.twilioSid}
                      className="border-b border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-2 pr-3 font-mono text-xs text-zinc-700 dark:text-zinc-200">
                        {line.twilioSid}
                      </td>
                      <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                        {line.toNumber || "—"}
                      </td>
                      <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                        {line.fromNumber || "—"}
                      </td>
                      <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                        {line.durationSeconds ?? "—"}s
                      </td>
                      <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                        {money(line.twilioCost, billPreview.currency)}
                      </td>
                      <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-200">
                        {money(line.markupApplied, billPreview.currency)}
                      </td>
                      <td className="py-2 font-semibold text-zinc-900 dark:text-zinc-100">
                        {money(line.lineAmount, billPreview.currency)}
                      </td>
                    </tr>
                  ))}
                  {(billPreview.lines || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-3 text-zinc-600 dark:text-zinc-300">
                        No billable logs found in selected range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {billResult ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <p className="text-sm text-zinc-700 dark:text-zinc-200">
              Bill #{billResult.id} generated with {billResult.totalCalls} calls. Total:{" "}
              <span className="font-semibold">{money(billResult.totalAmount, billResult.currency)}</span>
            </p>
            <a
              href={billResult.pdfUrl}
              className="mt-2 inline-block text-sm font-semibold text-emerald-700 underline underline-offset-4 dark:text-emerald-300"
              target="_blank"
              rel="noreferrer"
            >
              Open PDF invoice
            </a>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Recent bills</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="py-2 pr-3">ID</th>
                <th className="py-2 pr-3">Range</th>
                <th className="py-2 pr-3">Calls</th>
                <th className="py-2 pr-3">Twilio base</th>
                <th className="py-2 pr-3">Markup</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2">PDF</th>
              </tr>
            </thead>
            <tbody>
              {billHistory.map((b) => (
                <tr key={b.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 pr-3">{b.id}</td>
                  <td className="py-2 pr-3">
                    {new Date(b.fromDate).toLocaleDateString()} - {new Date(b.toDate).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-3">{b.totalCalls}</td>
                  <td className="py-2 pr-3">{money(b.twilioBaseAmount, b.currency)}</td>
                  <td className="py-2 pr-3">{money(b.markupAmount, b.currency)}</td>
                  <td className="py-2 pr-3 font-semibold">{money(b.totalAmount, b.currency)}</td>
                  <td className="py-2">
                    <a
                      href={`/api/billing/bills/${b.id}/pdf`}
                      className="text-sky-700 underline underline-offset-4 dark:text-sky-300"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
              {billHistory.length === 0 ? (
                <tr>
                  <td className="py-3 text-zinc-600 dark:text-zinc-300" colSpan={7}>
                    No bills yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
