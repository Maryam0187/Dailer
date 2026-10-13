"use client";

import { useCallback, useEffect, useState } from "react";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

function money(value, currency) {
  const num = Number(value || 0);
  return `${currency} ${num.toFixed(2)}`;
}

function CategoryBreakdown({ categories, currency }) {
  if (!Array.isArray(categories) || categories.length === 0) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-300">No usage in this range.</p>;
  }
  return (
    <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-200">
      {categories.map((c) => (
        <li key={c.category} className="flex items-center justify-between gap-3">
          <span>{c.label || c.category}</span>
          <span className="font-medium tabular-nums">{money(c.twilioCost, currency)}</span>
        </li>
      ))}
    </ul>
  );
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
  const [appliedFrom, setAppliedFrom] = useState(initialRange.from);
  const [appliedTo, setAppliedTo] = useState(initialRange.to);
  const [accountScope, setAccountScope] = useState("main");
  const [managerId, setManagerId] = useState("");
  const [teamOptions, setTeamOptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deletingBillId, setDeletingBillId] = useState(null);
  const [error, setError] = useState(null);
  const [billPreview, setBillPreview] = useState(null);
  const [billResult, setBillResult] = useState(null);
  const [billHistory, setBillHistory] = useState([]);

  function billingPayload(fromDate, toDate) {
    const payload = { fromDate, toDate };
    if (accountScope === "team" && managerId) {
      payload.managerId = Number(managerId);
    }
    return payload;
  }

  async function loadData() {
    setError(null);
    try {
      const [settingsRes, billsRes, numbersRes] = await Promise.all([
        fetch("/api/billing/settings", { credentials: "include" }),
        fetch("/api/billing/bills", { credentials: "include" }),
        fetch("/api/admin/twilio-numbers", { credentials: "include" }),
      ]);
      const settingsJson = await settingsRes.json().catch(() => ({}));
      const billsJson = await billsRes.json().catch(() => ({}));
      const numbersJson = await numbersRes.json().catch(() => ({}));
      if (!settingsRes.ok) throw new Error(settingsJson?.error || "Failed to load settings");
      if (!billsRes.ok) throw new Error(billsJson?.error || "Failed to load bills");

      setFixedMarkupPerCall(String(settingsJson.settings?.fixedMarkupPerCall ?? "0.00"));
      setCurrency(String(settingsJson.settings?.currency ?? "USD"));
      setBillHistory(billsJson.bills || []);

      const options = (numbersJson.teams || []).map((t) => ({
        id: t.managerId,
        username: t.managerUsername || `manager#${t.managerId}`,
      }));
      setTeamOptions(options);
      if (options.length && !options.some((o) => String(o.id) === String(managerId))) {
        setManagerId(String(options[0].id));
      }
    } catch (err) {
      setError(err.message || "Failed to load billing data");
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewBill = useCallback(
    async (fromDate, toDate, scope = accountScope, mid = managerId) => {
      if (!fromDate || !toDate) return;
      if (scope === "team" && !mid) {
        setError("Select a team with a Twilio subaccount");
        return;
      }
      setError(null);
      setPreviewing(true);
      setBillResult(null);
      setBillPreview(null);
      try {
        const payload = { fromDate, toDate };
        if (scope === "team" && mid) payload.managerId = Number(mid);
        const res = await fetch("/api/billing/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to preview bill");
        setBillPreview(json.preview);
      } catch (err) {
        setError(err.message || "Failed to preview bill");
      } finally {
        setPreviewing(false);
      }
    },
    [accountScope, managerId],
  );

  useEffect(() => {
    void previewBill(initialRange.from, initialRange.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setAppliedFrom(next.from);
    setAppliedTo(next.to);
    setBillPreview(null);
    setBillResult(null);
    void previewBill(next.from, next.to);
  }

  function onAccountScopeChange(nextScope) {
    setAccountScope(nextScope);
    setBillPreview(null);
    setBillResult(null);
    if (appliedFrom && appliedTo) {
      void previewBill(appliedFrom, appliedTo, nextScope, managerId);
    }
  }

  function onManagerChange(nextId) {
    setManagerId(nextId);
    setBillPreview(null);
    setBillResult(null);
    if (accountScope === "team" && appliedFrom && appliedTo && nextId) {
      void previewBill(appliedFrom, appliedTo, "team", nextId);
    }
  }

  async function onPreviewBill(e) {
    e.preventDefault();
    if (rangePreset !== "custom") return;
    if (!rangeFrom || !rangeTo) {
      setError("From date and to date are required");
      return;
    }
    if (rangeFrom > rangeTo) {
      setError("From date must be on or before to date");
      return;
    }
    setAppliedFrom(rangeFrom);
    setAppliedTo(rangeTo);
    await previewBill(rangeFrom, rangeTo);
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
        body: JSON.stringify(billingPayload(appliedFrom, appliedTo)),
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

  async function onDeleteBill(billId) {
    const id = Number(billId);
    if (!Number.isInteger(id) || id < 1) return;
    setError(null);
    setDeletingBillId(id);
    try {
      const res = await fetch(`/api/billing/bills/${id}/pdf`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to delete bill");
      setBillHistory((prev) => prev.filter((b) => Number(b.id) !== id));
      if (billResult && Number(billResult.id) === id) {
        setBillResult(null);
      }
    } catch (err) {
      setError(err.message || "Failed to delete bill");
    } finally {
      setDeletingBillId(null);
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm sm:p-6 dark:border-sky-900/40 dark:bg-zinc-900">
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

      <section className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-6 dark:border-emerald-900/40 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Generate bill</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={onPreviewBill}>
          <div className="sm:col-span-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="account-scope" className={labelClass}>
                Twilio account
              </label>
              <select
                id="account-scope"
                className={inputClass}
                value={accountScope}
                onChange={(e) => onAccountScopeChange(e.target.value)}
              >
                <option value="main">Main account (all unassigned / main usage)</option>
                <option value="team" disabled={teamOptions.length === 0}>
                  Team subaccount
                  {teamOptions.length === 0 ? " (none configured)" : ""}
                </option>
              </select>
            </div>
            {accountScope === "team" ? (
              <div>
                <label htmlFor="team-manager" className={labelClass}>
                  Team
                </label>
                <select
                  id="team-manager"
                  className={inputClass}
                  value={managerId}
                  onChange={(e) => onManagerChange(e.target.value)}
                >
                  {teamOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.username}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
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
              disabled={rangePreset !== "custom"}
              onChange={(e) => {
                setRangePreset("custom");
                setRangeFrom(e.target.value);
              }}
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
              disabled={rangePreset !== "custom"}
              onChange={(e) => {
                setRangePreset("custom");
                setRangeTo(e.target.value);
              }}
              required
            />
          </div>
          <div className="flex items-end sm:col-span-1">
            <button
              type="submit"
              disabled={previewing || generating || rangePreset !== "custom"}
              className="h-11 w-full rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
            >
              {previewing ? "Previewing..." : "Preview bill"}
            </button>
          </div>
        </form>

        {billPreview ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {new Date(billPreview.fromDate).toLocaleDateString()} –{" "}
              {new Date(billPreview.toDate).toLocaleDateString()}
              {" · "}
              {billPreview.accountScope === "team"
                ? `Team ${billPreview.managerUsername || `#${billPreview.managerId}`}`
                : "Main"}
            </p>
            <p className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Total cost: {money(billPreview.totalAmount, billPreview.currency)}
            </p>
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Breakdown
              </p>
              <CategoryBreakdown
                categories={billPreview.categories}
                currency={billPreview.currency}
              />
            </div>
            <button
              type="button"
              onClick={onGenerateBill}
              disabled={generating}
              className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
            >
              {generating ? "Generating PDF..." : "Generate PDF"}
            </button>
          </div>
        ) : null}

        {billResult ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <p className="text-sm text-zinc-700 dark:text-zinc-200">
              Bill #{billResult.id} saved. Total:{" "}
              <span className="font-semibold">
                {money(billResult.totalAmount, billResult.currency)}
              </span>
            </p>
            <div className="mt-3">
              <CategoryBreakdown
                categories={billResult.categories}
                currency={billResult.currency}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              {billResult.hasPdf !== false && billResult.pdfUrl ? (
                <a
                  href={billResult.pdfUrl}
                  className="text-sm font-semibold text-emerald-700 underline underline-offset-4 dark:text-emerald-300"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open PDF
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => onDeleteBill(billResult.id)}
                disabled={deletingBillId === Number(billResult.id)}
                className="text-sm font-semibold text-red-700 underline underline-offset-4 disabled:opacity-50 dark:text-red-300"
              >
                {deletingBillId === Number(billResult.id) ? "Deleting..." : "Delete bill"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Recent bills</h2>

        <div className="mt-4 space-y-3">
          {billHistory.map((b) => (
            <article
              key={b.id}
              className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-950/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">Bill #{b.id}</p>
                  <p className="mt-0.5 text-zinc-600 dark:text-zinc-300">
                    {b.accountScope === "team"
                      ? `Team ${b.managerUsername || `#${b.managerId}`}`
                      : "Main"}{" "}
                    · {new Date(b.fromDate).toLocaleDateString()} –{" "}
                    {new Date(b.toDate).toLocaleDateString()}
                  </p>
                </div>
                <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {money(b.totalAmount, b.currency)}
                </p>
              </div>
              <div className="mt-3">
                <CategoryBreakdown categories={b.categories} currency={b.currency} />
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {b.hasPdf && b.pdfUrl ? (
                  <a
                    href={b.pdfUrl}
                    className="font-semibold text-sky-700 underline underline-offset-4 dark:text-sky-300"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open PDF
                  </a>
                ) : (
                  <span className="text-zinc-500 dark:text-zinc-400">No PDF</span>
                )}
                <button
                  type="button"
                  onClick={() => onDeleteBill(b.id)}
                  disabled={deletingBillId === Number(b.id)}
                  className="font-semibold text-red-700 underline underline-offset-4 disabled:opacity-50 dark:text-red-300"
                >
                  {deletingBillId === Number(b.id) ? "Deleting..." : "Delete bill"}
                </button>
              </div>
            </article>
          ))}
          {billHistory.length === 0 ? (
            <p className="py-3 text-sm text-zinc-600 dark:text-zinc-300">No bills yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
