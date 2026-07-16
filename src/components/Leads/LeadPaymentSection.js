"use client";

import { useCallback, useEffect, useState } from "react";
import {
  detectCardBrand,
  formatCardNumberInput,
  formatCvvInput,
  formatExpDateInput,
  validateCardNumber,
  validateCvv,
  validateExpDate,
} from "@/lib/cardPaymentFormat";
import {
  formatLeadPaymentChargeAmount,
  getLeadPaymentMethodMeta,
} from "@/lib/leadWorkflow";

const PAYMENT_TYPES = [
  { value: "card", label: "Card" },
  { value: "e_check", label: "E-check" },
  { value: "check_mail", label: "Check mail" },
  { value: "pos_link", label: "POS" },
];

const CARD_TYPES = [
  { value: "Credit", label: "Credit" },
  { value: "Debit", label: "Debit" },
  { value: "Prepaid", label: "Prepaid" },
];

const CARD_BRANDS = [
  { value: "Visa", label: "Visa" },
  { value: "Mastercard", label: "Mastercard" },
  { value: "Amex", label: "American Express" },
  { value: "Discover", label: "Discover" },
  { value: "Other", label: "Other" },
];

const btnSecondary =
  "rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";
const btnPrimary =
  "rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50";

/** Discourage Chrome/Google + password-manager save/autofill prompts on payment fields. */
const noBrowserSaveProps = {
  autoComplete: "one-time-code",
  autoCorrect: "off",
  spellCheck: false,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
};

function emptyPaymentForm(defaults = {}) {
  return {
    type: "card",
    isDefault: false,
    chargeAmount: "",
    nameOnCard: "",
    cardType: "",
    brand: "",
    cardNumber: "",
    expDate: "",
    cvv: "",
    routingNumber: "",
    accountNumber: "",
    checkNumber: "",
    bankName: "",
    email: "",
    notes: "",
    ...defaults,
  };
}

function paymentTypeLabel(type) {
  return PAYMENT_TYPES.find((t) => t.value === type)?.label || getLeadPaymentMethodMeta(type).label || type;
}

function roleLabel(role) {
  if (!role) return "";
  const map = {
    admin: "Admin",
    supervisor: "Supervisor",
    agent: "Agent",
    manager: "Manager",
    processor: "Processor",
    lead_monitor: "Lead monitor",
  };
  return map[role] || role;
}

function addedByLabel(pm) {
  const name = pm.createdByUsername || "Unknown";
  const role = roleLabel(pm.createdByRole);
  return role ? `${name} (${role})` : name;
}

function maskTail(value, keep = 4) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= keep) return digits;
  return `•••• ${digits.slice(-keep)}`;
}

function paymentSummary(pm) {
  if (pm.type === "card") {
    const brand = pm.brand || pm.cardType || "Card";
    const num = pm.sensitiveLocked ? pm.cardNumber || "" : maskTail(pm.cardNumber);
    const exp = pm.expDate ? ` exp ${pm.expDate}` : "";
    return `${brand} ${num}${exp}`.trim();
  }
  if (pm.type === "e_check") {
    const bank = pm.bankName || "E-check";
    const acct = pm.sensitiveLocked ? pm.accountNumber || "" : maskTail(pm.accountNumber);
    return `${bank} ${acct}`.trim();
  }
  if (pm.type === "check_mail") {
    const parts = [pm.bankName, pm.checkNumber ? `#${pm.checkNumber}` : null].filter(Boolean);
    return parts.join(" · ") || "Check mail";
  }
  return pm.email || pm.notes?.slice(0, 60) || "POS";
}

function ViewField({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 break-all text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {value || "—"}
      </dd>
    </div>
  );
}

function PaymentViewDetails({ pm }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <ViewField label="Type" value={paymentTypeLabel(pm.type)} />
      {pm.type === "card" ? (
        <>
          <ViewField label="Name on card" value={pm.nameOnCard || "—"} />
          <ViewField label="Card number" value={pm.cardNumber} />
          <ViewField label="Card type" value={pm.cardType} />
          <ViewField label="Brand" value={pm.brand} />
          <ViewField label="Exp date" value={pm.expDate} />
          <ViewField label="CVV" value={pm.cvv} />
        </>
      ) : null}
      {pm.type === "e_check" ? (
        <>
          <ViewField label="Routing number" value={pm.routingNumber} />
          <ViewField label="Account number" value={pm.accountNumber} />
          <ViewField label="Check number" value={pm.checkNumber} />
          <ViewField label="Bank name" value={pm.bankName} />
        </>
      ) : null}
      {pm.type === "check_mail" ? (
        <>
          <ViewField label="Check number" value={pm.checkNumber} />
          <ViewField label="Bank name" value={pm.bankName} />
        </>
      ) : null}
      {pm.type === "pos_link" ? <ViewField label="Email" value={pm.email} /> : null}
      <div className="sm:col-span-2">
        <ViewField label="Notes" value={pm.notes} />
      </div>
      <ViewField label="Added by" value={addedByLabel(pm)} />
    </dl>
  );
}

export default function LeadPaymentSection({
  lead,
  onLeadUpdated,
  onReloadActivity,
  labelClass,
  inputClass,
  canEditChargeAmount = false,
}) {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [viewingPayment, setViewingPayment] = useState(null);
  const [paymentForm, setPaymentForm] = useState(() => emptyPaymentForm());
  const [cardFieldErrors, setCardFieldErrors] = useState({
    cardNumber: "",
    expDate: "",
    cvv: "",
  });
  const [saving, setSaving] = useState(false);
  const [showAmountEditor, setShowAmountEditor] = useState(false);
  const [amountDraft, setAmountDraft] = useState("");
  const [savingAmount, setSavingAmount] = useState(false);

  const loadPayments = useCallback(async () => {
    if (!lead?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/payment-methods`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load payment methods");
      setPaymentMethods(json.paymentMethods || []);
    } catch (e) {
      setError(e.message || "Failed to load payment methods");
      setPaymentMethods([]);
    } finally {
      setLoading(false);
    }
  }, [lead?.id]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments, lead?.updatedAt, lead?.leadPhase]);

  function startAddPayment() {
    setViewingPayment(null);
    setCardFieldErrors({ cardNumber: "", expDate: "", cvv: "" });
    setPaymentForm(
      emptyPaymentForm({
        nameOnCard: lead?.fullName?.trim() || "",
        email: lead?.email?.trim() || "",
        chargeAmount:
          lead?.leadPaymentChargeAmount != null ? String(lead.leadPaymentChargeAmount) : "",
      }),
    );
    setShowForm(true);
    setError(null);
  }

  function closeForm() {
    setShowForm(false);
    setCardFieldErrors({ cardNumber: "", expDate: "", cvv: "" });
  }

  function onPaymentTypeChange(type) {
    setPaymentForm((prev) => ({
      ...emptyPaymentForm({
        nameOnCard: prev.nameOnCard || lead?.fullName?.trim() || "",
        email: prev.email || lead?.email?.trim() || "",
        chargeAmount: prev.chargeAmount || "",
      }),
      type,
    }));
    setCardFieldErrors({ cardNumber: "", expDate: "", cvv: "" });
  }

  function validateCardFieldsForSave() {
    if (paymentForm.type !== "card") return true;
    const numberResult = validateCardNumber(paymentForm.cardNumber);
    const expResult = validateExpDate(paymentForm.expDate);
    const cvvResult = validateCvv(paymentForm.cvv);
    setCardFieldErrors({
      cardNumber: numberResult.ok ? "" : numberResult.error,
      expDate: expResult.ok ? "" : expResult.error,
      cvv: cvvResult.ok ? "" : cvvResult.error,
    });
    return numberResult.ok && expResult.ok && cvvResult.ok;
  }

  async function savePayment(e) {
    e.preventDefault();
    if (!lead?.id) return;
    setError(null);
    if (!validateCardFieldsForSave()) {
      setError("Fix the card number, exp date, and CVV before saving");
      return;
    }
    setSaving(true);
    try {
      const numberResult =
        paymentForm.type === "card" ? validateCardNumber(paymentForm.cardNumber) : null;
      const expResult = paymentForm.type === "card" ? validateExpDate(paymentForm.expDate) : null;
      const cvvResult = paymentForm.type === "card" ? validateCvv(paymentForm.cvv) : null;
      const payload = {
        type: paymentForm.type,
        isDefault: false,
        leadPaymentChargeAmount: paymentForm.chargeAmount.trim() || null,
        nameOnCard: paymentForm.nameOnCard || null,
        cardType: paymentForm.cardType || null,
        brand: paymentForm.brand || null,
        cardNumber:
          paymentForm.type === "card"
            ? numberResult?.digits || null
            : paymentForm.cardNumber || null,
        expDate:
          paymentForm.type === "card" ? expResult?.expDate || null : paymentForm.expDate || null,
        cvv: paymentForm.type === "card" ? cvvResult?.cvv || null : paymentForm.cvv || null,
        routingNumber: paymentForm.routingNumber || null,
        accountNumber: paymentForm.accountNumber || null,
        checkNumber: paymentForm.checkNumber || null,
        bankName: paymentForm.bankName || null,
        email: paymentForm.type === "pos_link" ? paymentForm.email || null : null,
        notes: paymentForm.notes || null,
      };

      const res = await fetch(`/api/leads/${lead.id}/payment-methods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save payment method");

      closeForm();
      setPaymentForm(emptyPaymentForm());
      if (json.lead) onLeadUpdated?.(json.lead);
      await loadPayments();
      await onReloadActivity?.();
    } catch (err) {
      setError(err.message || "Failed to save payment method");
    } finally {
      setSaving(false);
    }
  }

  async function saveChargeAmount() {
    if (!lead?.id || !lead?.customerId) {
      setError("Lead needs a linked customer before amount can be updated");
      return;
    }
    setSavingAmount(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${lead.customerId}/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          leadPaymentChargeAmount: amountDraft.trim() === "" ? null : amountDraft.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to update charge amount");
      setShowAmountEditor(false);
      if (json.lead) {
        onLeadUpdated?.({
          ...lead,
          leadPaymentChargeAmount:
            json.lead.leadPaymentChargeAmount != null
              ? Number(json.lead.leadPaymentChargeAmount)
              : null,
        });
      }
      await onReloadActivity?.();
    } catch (err) {
      setError(err.message || "Failed to update charge amount");
    } finally {
      setSavingAmount(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-indigo-200/80 bg-indigo-50/40 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Payment methods</h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Add a payment method to link it to this lead.
          </p>
        </div>
        <button type="button" className={btnSecondary} onClick={startAddPayment} disabled={saving}>
          Add payment
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Charge amount:{" "}
          <span className="tabular-nums text-emerald-700 dark:text-emerald-300">
            {lead?.leadPaymentChargeAmount != null
              ? formatLeadPaymentChargeAmount(lead.leadPaymentChargeAmount)
              : "—"}
          </span>
        </p>
        {canEditChargeAmount ? (
          <button
            type="button"
            className={btnSecondary}
            disabled={savingAmount}
            onClick={() => {
              setAmountDraft(
                lead?.leadPaymentChargeAmount != null
                  ? String(lead.leadPaymentChargeAmount)
                  : "",
              );
              setShowAmountEditor(true);
              setError(null);
            }}
          >
            Change
          </button>
        ) : null}
      </div>

      {canEditChargeAmount && showAmountEditor ? (
        <div className="mt-3 space-y-2 rounded-xl border border-indigo-200 bg-white p-3 dark:border-indigo-800 dark:bg-zinc-950">
          <label className={labelClass}>
            New charge amount
            <input
              className={inputClass}
              value={amountDraft}
              onChange={(e) => setAmountDraft(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              autoFocus
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={savingAmount || !lead?.customerId}
              onClick={() => void saveChargeAmount()}
            >
              {savingAmount ? "Saving…" : "Save amount"}
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={savingAmount}
              onClick={() => setShowAmountEditor(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="mt-3 text-sm text-zinc-500">Loading payment methods…</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {paymentMethods.length === 0 ? (
            <li className="text-sm text-zinc-500">No payment methods saved for this lead yet.</li>
          ) : (
            paymentMethods.map((pm) => {
              return (
                <li
                  key={pm.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <div>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {paymentTypeLabel(pm.type)}
                    </div>
                    <div className="text-xs text-zinc-500">{paymentSummary(pm)}</div>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      Added by {addedByLabel(pm)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => {
                      setShowForm(false);
                      setViewingPayment(pm);
                    }}
                  >
                    View
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}

      {viewingPayment ? (
        <div className="mt-4 space-y-3 rounded-xl border border-indigo-200 bg-white p-4 dark:border-indigo-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              View payment method
            </p>
            <button type="button" className={btnSecondary} onClick={() => setViewingPayment(null)}>
              Close
            </button>
          </div>
          <PaymentViewDetails pm={viewingPayment} />
        </div>
      ) : null}

      {showForm && !viewingPayment ? (
        <form
          onSubmit={savePayment}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          data-form-type="other"
          className="mt-4 space-y-3 border-t border-indigo-200/80 pt-4 dark:border-indigo-900/50"
        >
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">New payment method</p>
          <label className={labelClass}>
            Charge amount
            <input
              className={inputClass}
              value={paymentForm.chargeAmount}
              onChange={(e) =>
                setPaymentForm((prev) => ({ ...prev, chargeAmount: e.target.value }))
              }
              inputMode="decimal"
              placeholder="0.00"
              {...noBrowserSaveProps}
            />
          </label>
          <label className={labelClass}>
            Type
            <select
              className={inputClass}
              value={paymentForm.type}
              onChange={(e) => onPaymentTypeChange(e.target.value)}
              autoComplete="off"
            >
              {PAYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {paymentForm.type === "card" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`${labelClass} sm:col-span-2`}>
                Name on card
                <input
                  className={inputClass}
                  value={paymentForm.nameOnCard}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, nameOnCard: e.target.value }))
                  }
                  placeholder="Name as printed on card"
                  {...noBrowserSaveProps}
                />
              </label>
              <label className={`${labelClass} sm:col-span-2`}>
                Card number
                <input
                  className={`${inputClass}${cardFieldErrors.cardNumber ? " border-red-400 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                  value={paymentForm.cardNumber}
                  onChange={(e) => {
                    const next = formatCardNumberInput(e.target.value);
                    const brand = detectCardBrand(next);
                    setPaymentForm((prev) => ({
                      ...prev,
                      cardNumber: next,
                      brand: brand || prev.brand,
                    }));
                    setCardFieldErrors((prev) => ({ ...prev, cardNumber: "" }));
                  }}
                  onBlur={() => {
                    const result = validateCardNumber(paymentForm.cardNumber);
                    setCardFieldErrors((prev) => ({
                      ...prev,
                      cardNumber: result.ok ? "" : result.error,
                    }));
                  }}
                  inputMode="numeric"
                  placeholder="•••• •••• •••• ••••"
                  maxLength={23}
                  {...noBrowserSaveProps}
                />
                {cardFieldErrors.cardNumber ? (
                  <span className="mt-1 block text-xs font-medium text-red-600 dark:text-red-400">
                    {cardFieldErrors.cardNumber}
                  </span>
                ) : null}
              </label>
              <label className={labelClass}>
                Card type
                <select
                  className={inputClass}
                  value={paymentForm.cardType}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, cardType: e.target.value }))
                  }
                  autoComplete="off"
                >
                  <option value="">Select card type</option>
                  {CARD_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Brand
                <select
                  className={inputClass}
                  value={paymentForm.brand}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, brand: e.target.value }))}
                  autoComplete="off"
                >
                  <option value="">Select brand</option>
                  {CARD_BRANDS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Exp date
                <input
                  className={`${inputClass}${cardFieldErrors.expDate ? " border-red-400 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                  value={paymentForm.expDate}
                  onChange={(e) => {
                    const input = e.target;
                    const next = formatExpDateInput(input.value, paymentForm.expDate);
                    setPaymentForm((prev) => ({ ...prev, expDate: next }));
                    setCardFieldErrors((prev) => ({ ...prev, expDate: "" }));
                    requestAnimationFrame(() => {
                      const pos = next.length;
                      try {
                        input.setSelectionRange(pos, pos);
                      } catch {
                        // ignore
                      }
                    });
                  }}
                  onBlur={() => {
                    const result = validateExpDate(paymentForm.expDate);
                    setCardFieldErrors((prev) => ({
                      ...prev,
                      expDate: result.ok ? "" : result.error,
                    }));
                  }}
                  placeholder="MM/YY"
                  inputMode="numeric"
                  maxLength={5}
                  {...noBrowserSaveProps}
                />
                {cardFieldErrors.expDate ? (
                  <span className="mt-1 block text-xs font-medium text-red-600 dark:text-red-400">
                    {cardFieldErrors.expDate}
                  </span>
                ) : null}
              </label>
              <label className={labelClass}>
                CVV
                <input
                  className={`${inputClass}${cardFieldErrors.cvv ? " border-red-400 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                  value={paymentForm.cvv}
                  onChange={(e) => {
                    const next = formatCvvInput(e.target.value);
                    setPaymentForm((prev) => ({ ...prev, cvv: next }));
                    setCardFieldErrors((prev) => ({ ...prev, cvv: "" }));
                  }}
                  onBlur={() => {
                    const result = validateCvv(paymentForm.cvv);
                    setCardFieldErrors((prev) => ({
                      ...prev,
                      cvv: result.ok ? "" : result.error,
                    }));
                  }}
                  inputMode="numeric"
                  placeholder="•••"
                  maxLength={4}
                  {...noBrowserSaveProps}
                />
                {cardFieldErrors.cvv ? (
                  <span className="mt-1 block text-xs font-medium text-red-600 dark:text-red-400">
                    {cardFieldErrors.cvv}
                  </span>
                ) : null}
              </label>
            </div>
          ) : null}

          {paymentForm.type === "e_check" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Routing number
                <input
                  className={inputClass}
                  value={paymentForm.routingNumber}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, routingNumber: e.target.value }))
                  }
                  inputMode="numeric"
                  {...noBrowserSaveProps}
                />
              </label>
              <label className={labelClass}>
                Account number
                <input
                  className={inputClass}
                  value={paymentForm.accountNumber}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, accountNumber: e.target.value }))
                  }
                  inputMode="numeric"
                  {...noBrowserSaveProps}
                />
              </label>
              <label className={labelClass}>
                Check number
                <input
                  className={inputClass}
                  value={paymentForm.checkNumber}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, checkNumber: e.target.value }))
                  }
                  {...noBrowserSaveProps}
                />
              </label>
              <label className={labelClass}>
                Bank name
                <input
                  className={inputClass}
                  value={paymentForm.bankName}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, bankName: e.target.value }))
                  }
                  {...noBrowserSaveProps}
                />
              </label>
            </div>
          ) : null}

          {paymentForm.type === "check_mail" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Check number
                <input
                  className={inputClass}
                  value={paymentForm.checkNumber}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, checkNumber: e.target.value }))
                  }
                  {...noBrowserSaveProps}
                />
              </label>
              <label className={labelClass}>
                Bank name
                <input
                  className={inputClass}
                  value={paymentForm.bankName}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, bankName: e.target.value }))
                  }
                  {...noBrowserSaveProps}
                />
              </label>
            </div>
          ) : null}

          {paymentForm.type === "pos_link" ? (
            <>
              <label className={labelClass}>
                Email
                <input
                  className={inputClass}
                  type="email"
                  value={paymentForm.email}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="customer@example.com"
                  {...noBrowserSaveProps}
                />
              </label>
              <label className={labelClass}>
                Notes
                <textarea
                  className={inputClass}
                  rows={2}
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="POS reference…"
                  {...noBrowserSaveProps}
                />
              </label>
            </>
          ) : (
            <label className={labelClass}>
              Notes
              <textarea
                className={inputClass}
                rows={2}
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
                {...noBrowserSaveProps}
              />
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={btnPrimary} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className={btnSecondary} onClick={closeForm} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
