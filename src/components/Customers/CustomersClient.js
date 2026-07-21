"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { digitsOnly, formatLandline } from "@/lib/phoneFormat";
import {
  detectCardBrand,
  formatCardNumberInput,
  formatCvvInput,
  formatExpDateInput,
  validateCardNumber,
  validateCvv,
  validateExpDate,
} from "@/lib/cardPaymentFormat";
import { validateListSearchQuery } from "@/lib/listSearchValidation";
import { US_STATES } from "@/lib/usStates";
import { formatLeadService } from "@/lib/leadService";
import {
  formatLeadPaymentChargeAmount,
  getLeadPaymentChargeStatusMeta,
  getLeadPaymentMethodMeta,
  getLeadPaymentProcessorMeta,
  getLeadPhaseMeta,
  getLeadProgressTagMeta,
  LEAD_PAYMENT_CHARGE_STATUSES,
  LEAD_PAYMENT_PROCESSORS,
  WORKFLOW_BADGE_CLASS,
} from "@/lib/leadWorkflow";
import {
  ADMIN_SHORT_LABELS_STORAGE_KEY,
  buildWorkflowTagLookup,
  resolvePreferShortLabels,
} from "@/lib/workflowTagLabels";
import IconTooltipButton, {
  CheckIcon,
  CopyLinkIcon,
  ViewIcon,
} from "@/components/Leads/IconTooltipButton";
import LeadDetailPanel from "@/components/Leads/LeadDetailPanel";
import LeadEditModal from "@/components/Leads/LeadEditModal";
import PaymentProcessorsAdminPanel from "@/components/Customers/PaymentProcessorsAdminPanel";

const CUSTOMERS_PAGE_SIZE = 10;

const inputClass =
  "mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const labelClass = "block text-sm font-medium text-zinc-800 dark:text-zinc-200";
const btnPrimary =
  "rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50";
const btnSecondary =
  "rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
const btnPage =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

const SEARCH_BY_OPTIONS = [
  { value: "all", label: "All", placeholder: "Phone, name, or last 4" },
  { value: "phone", label: "Phone", placeholder: "Phone number" },
  { value: "name", label: "Name", placeholder: "Customer name" },
  { value: "last4", label: "Last 4", placeholder: "Phone last 4 digits" },
];

const SALE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

const DATE_FIELD_OPTIONS = [
  { value: "updated", label: "Updated" },
  { value: "created", label: "Created" },
  { value: "verified", label: "Verified" },
  { value: "processed", label: "Processed" },
  { value: "sale_done", label: "Sale done" },
];

const PAYMENT_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "card", label: "Card" },
  { value: "pos_link", label: "Link" },
  { value: "check_mail", label: "Check mail" },
  { value: "e_check", label: "E-check" },
];

const CHARGE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "charged", label: "Charged" },
  { value: "declined", label: "Declined" },
  { value: "chargeback", label: "Chargeback" },
];

const DATE_RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
];

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
    const d = formatDateInput(today);
    return { from: d, to: d };
  }
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const d = formatDateInput(y);
    return { from: d, to: d };
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

function formatWhen(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function paymentTypeLabel(type) {
  return PAYMENT_TYPES.find((t) => t.value === type)?.label || type;
}

function paymentMethodOptionLabel(pm) {
  if (!pm) return "";
  const type = paymentTypeLabel(pm.type);
  const summary = paymentSummary(pm);
  const def = pm.isDefault ? " · Default" : "";
  return `${type} · ${summary}${def}`;
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
    const num = maskTail(pm.cardNumber);
    const exp = pm.expDate ? ` exp ${pm.expDate}` : "";
    return `${brand} ${num}${exp}`.trim();
  }
  if (pm.type === "e_check") {
    const bank = pm.bankName || "E-check";
    const acct = maskTail(pm.accountNumber);
    return `${bank} ${acct}`.trim();
  }
  if (pm.type === "check_mail") {
    const parts = [pm.bankName, pm.checkNumber ? `#${pm.checkNumber}` : null].filter(Boolean);
    return parts.join(" · ") || "Check mail";
  }
  return pm.email || pm.notes?.slice(0, 60) || "POS";
}

function emptyPaymentForm(defaults = {}) {
  return {
    type: "card",
    isDefault: false,
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
      <ViewField label="Default" value={pm.isDefault ? "Yes" : "No"} />
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
      <ViewField label="Created" value={formatWhen(pm.createdAt)} />
      <ViewField label="Created by" value={pm.createdByUsername} />
    </dl>
  );
}

export default function CustomersClient() {
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: CUSTOMERS_PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchBy, setSearchBy] = useState("all");
  const [searchError, setSearchError] = useState(null);
  const [saleFilter, setSaleFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [chargeFilter, setChargeFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [dateField, setDateField] = useState("updated");
  const [rangePreset, setRangePreset] = useState("today");
  const [rangeFrom, setRangeFrom] = useState(() => getPresetRange("today").from);
  const [rangeTo, setRangeTo] = useState(() => getPresetRange("today").to);
  const [appliedFrom, setAppliedFrom] = useState(() => getPresetRange("today").from);
  const [appliedTo, setAppliedTo] = useState(() => getPresetRange("today").to);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [viewingPayment, setViewingPayment] = useState(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [cardFieldErrors, setCardFieldErrors] = useState({
    cardNumber: "",
    expDate: "",
    cvv: "",
  });
  const [linkingLeadId, setLinkingLeadId] = useState(null);
  const [chargingLeadId, setChargingLeadId] = useState(null);
  const [chargeModal, setChargeModal] = useState(null);
  const [chargeProcessor, setChargeProcessor] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [amountModalLead, setAmountModalLead] = useState(null);
  const [amountDraft, setAmountDraft] = useState("");
  const [savingAmountLeadId, setSavingAmountLeadId] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [editingLead, setEditingLead] = useState(null);
  const [loadingLeadId, setLoadingLeadId] = useState(null);
  const [copiedLeadId, setCopiedLeadId] = useState(null);
  const [workflowTags, setWorkflowTags] = useState([]);
  const [paymentProcessors, setPaymentProcessors] = useState(LEAD_PAYMENT_PROCESSORS.map((p) => ({
    code: p.value,
    fullName: p.fullName || p.label,
    shortCode: p.label,
    tone: p.tone,
    active: true,
  })));
  const [activeView, setActiveView] = useState("customers");
  const loadRequestIdRef = useRef(0);
  const [adminShortLabels, setAdminShortLabels] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(ADMIN_SHORT_LABELS_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const workflowTagLookup = useMemo(() => buildWorkflowTagLookup(workflowTags), [workflowTags]);
  const preferShortLabels = resolvePreferShortLabels(true, adminShortLabels);
  const activePaymentProcessors = useMemo(
    () => paymentProcessors.filter((p) => p.active !== false),
    [paymentProcessors],
  );

  const loadPaymentProcessors = useCallback(async () => {
    try {
      const res = await fetch("/api/payment-processors", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json.processors) && json.processors.length > 0) {
        setPaymentProcessors(json.processors);
      }
    } catch {
      // keep seed fallback
    }
  }, []);

  const loadCustomers = useCallback(
    async (
      page = 1,
      {
        query = q,
        by = searchBy,
        sale = saleFilter,
        payment = paymentFilter,
        charge = chargeFilter,
        state = stateFilter,
        shift = shiftFilter,
        field = dateField,
        from = appliedFrom,
        to = appliedTo,
      } = {},
    ) => {
      const requestId = ++loadRequestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(CUSTOMERS_PAGE_SIZE),
        });
        if (query.trim()) {
          params.set("q", query.trim());
          params.set("searchBy", by);
        }
        if (sale && sale !== "all") params.set("saleFilter", sale);
        if (payment && payment !== "all") params.set("paymentFilter", payment);
        if (charge && charge !== "all") params.set("chargeFilter", charge);
        if (state && state !== "all") params.set("state", state);
        if (shift && shift !== "all") params.set("shiftKey", shift);
        params.set("dateField", field || "updated");
        // Date range applies only when not doing a phone/name/last4 search
        if (!query.trim() && from && to) {
          params.set("fromDate", from);
          params.set("toDate", to);
        }
        const res = await fetch(`/api/customers?${params}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (requestId !== loadRequestIdRef.current) return;
        if (!res.ok) throw new Error(json?.error || "Failed to load customers");
        setCustomers(json.customers || []);
        setPagination(
          json.pagination || {
            page: 1,
            pageSize: CUSTOMERS_PAGE_SIZE,
            total: 0,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        );
      } catch (err) {
        if (requestId !== loadRequestIdRef.current) return;
        setError(err.message || "Failed to load customers");
        setCustomers([]);
      } finally {
        if (requestId === loadRequestIdRef.current) setLoading(false);
      }
    },
    [
      q,
      searchBy,
      saleFilter,
      paymentFilter,
      chargeFilter,
      stateFilter,
      shiftFilter,
      dateField,
      appliedFrom,
      appliedTo,
    ],
  );

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setPaymentError(null);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load customer");
      setDetail(json);
    } catch (err) {
      setPaymentError(err.message || "Failed to load customer");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomers(1);
  }, [
    q,
    searchBy,
    saleFilter,
    paymentFilter,
    chargeFilter,
    stateFilter,
    dateField,
    appliedFrom,
    appliedTo,
    loadCustomers,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workflow-tags", { credentials: "include", cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setWorkflowTags(json.tags || []);
      } catch {
        // ignore — panel falls back to built-in labels
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadPaymentProcessors();
  }, [loadPaymentProcessors]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
    setViewingPayment(null);
    setEditingPaymentId(null);
    setShowPaymentForm(false);
    setPaymentForm(emptyPaymentForm());
    setCardFieldErrors({ cardNumber: "", expDate: "", cvv: "" });
    setPaymentError(null);
  }, [selectedId, loadDetail]);

  // Prefill name on card from customer when opening a new payment form
  useEffect(() => {
    if (!detail?.customer || !showPaymentForm || editingPaymentId || viewingPayment) return;
    const name =
      detail.customer.fullName?.trim() || detail.customer.displayName?.trim() || "";
    if (!name) return;
    setPaymentForm((prev) => {
      if (prev.nameOnCard) return prev;
      return { ...prev, nameOnCard: name };
    });
  }, [detail, showPaymentForm, editingPaymentId, viewingPayment]);

  function onSearch(e) {
    e.preventDefault();
    const check = validateListSearchQuery(searchBy, searchInput);
    if (!check.isValid) {
      setSearchError(check.message);
      return;
    }
    if (rangePreset === "custom") {
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
    }
    setSearchError(null);
    setError(null);
    setQ(check.normalized);
    if (check.normalized && searchBy === "phone") {
      setSearchInput(formatLandline(check.normalized));
    } else {
      setSearchInput(check.normalized);
    }
    setSelectedId(null);
  }

  function onRangePresetChange(preset) {
    setRangePreset(preset);
    setSelectedId(null);
    setError(null);
    if (preset === "custom") return;
    const next = getPresetRange(preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
    setAppliedFrom(next.from);
    setAppliedTo(next.to);
  }

  function clearFilters() {
    setSearchInput("");
    setQ("");
    setSearchBy("all");
    setSearchError(null);
    setSaleFilter("all");
    setPaymentFilter("all");
    setChargeFilter("all");
    setStateFilter("all");
    setShiftFilter("all");
    setDateField("updated");
    const todayRange = getPresetRange("today");
    setRangePreset("today");
    setRangeFrom(todayRange.from);
    setRangeTo(todayRange.to);
    setAppliedFrom(todayRange.from);
    setAppliedTo(todayRange.to);
    setSelectedId(null);
    setError(null);
  }

  const hasActiveFilters =
    Boolean(q) ||
    searchBy !== "all" ||
    saleFilter !== "all" ||
    paymentFilter !== "all" ||
    chargeFilter !== "all" ||
    stateFilter !== "all" ||
    shiftFilter !== "all" ||
    dateField !== "updated" ||
    rangePreset !== "today";

  function onPrevPage() {
    if (!pagination.hasPrev || loading) return;
    void loadCustomers(pagination.page - 1);
  }

  function onNextPage() {
    if (!pagination.hasNext || loading) return;
    void loadCustomers(pagination.page + 1);
  }

  const searchPlaceholder =
    SEARCH_BY_OPTIONS.find((opt) => opt.value === searchBy)?.placeholder || "Search";

  function customerName() {
    return detail?.customer?.fullName || detail?.customer?.displayName || "";
  }

  function newPaymentForm() {
    return emptyPaymentForm({ nameOnCard: customerName() });
  }

  function startViewPayment(pm) {
    setViewingPayment(pm);
    setEditingPaymentId(null);
    setShowPaymentForm(false);
    setPaymentForm(newPaymentForm());
    setPaymentError(null);
  }

  function startEditPayment(pm) {
    setViewingPayment(null);
    setEditingPaymentId(pm.id);
    setShowPaymentForm(true);
    setPaymentForm({
      type: pm.type,
      isDefault: Boolean(pm.isDefault),
      nameOnCard: pm.nameOnCard || customerName(),
      cardType: pm.cardType || "",
      brand: pm.brand || "",
      cardNumber: formatCardNumberInput(pm.cardNumber || ""),
      expDate: formatExpDateInput(pm.expDate || ""),
      cvv: formatCvvInput(pm.cvv || ""),
      routingNumber: pm.routingNumber || "",
      accountNumber: pm.accountNumber || "",
      checkNumber: pm.checkNumber || "",
      bankName: pm.bankName || "",
      email: pm.email || "",
      notes: pm.notes || "",
    });
    setCardFieldErrors({ cardNumber: "", expDate: "", cvv: "" });
    setPaymentError(null);
  }

  function startAddPayment() {
    setViewingPayment(null);
    setEditingPaymentId(null);
    setShowPaymentForm(true);
    setPaymentForm(newPaymentForm());
    setCardFieldErrors({ cardNumber: "", expDate: "", cvv: "" });
    setPaymentError(null);
  }

  function closePaymentForm() {
    setShowPaymentForm(false);
    setEditingPaymentId(null);
    setPaymentForm(newPaymentForm());
    setCardFieldErrors({ cardNumber: "", expDate: "", cvv: "" });
    setPaymentError(null);
  }

  function validateCardFieldsForSave() {
    if (paymentForm.type !== "card") {
      setCardFieldErrors({ cardNumber: "", expDate: "", cvv: "" });
      return true;
    }
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

  function onPaymentTypeChange(nextType) {
    setPaymentForm((prev) => ({
      ...prev,
      type: nextType,
      nameOnCard:
        nextType === "card" && !prev.nameOnCard ? customerName() : prev.nameOnCard,
    }));
  }

  async function savePayment(e) {
    e.preventDefault();
    if (!selectedId) return;
    setPaymentError(null);
    if (!validateCardFieldsForSave()) {
      setPaymentError("Fix the card number, exp date, and CVV before saving");
      return;
    }
    setSavingPayment(true);
    try {
      const numberResult =
        paymentForm.type === "card" ? validateCardNumber(paymentForm.cardNumber) : null;
      const expResult = paymentForm.type === "card" ? validateExpDate(paymentForm.expDate) : null;
      const cvvResult = paymentForm.type === "card" ? validateCvv(paymentForm.cvv) : null;
      const payload = {
        type: paymentForm.type,
        isDefault: paymentForm.isDefault,
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

      const url = editingPaymentId
        ? `/api/customers/${selectedId}/payment-methods/${editingPaymentId}`
        : `/api/customers/${selectedId}/payment-methods`;
      const res = await fetch(url, {
        method: editingPaymentId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save payment method");
      setPaymentForm(newPaymentForm());
      setEditingPaymentId(null);
      setShowPaymentForm(false);
      await loadDetail(selectedId);
      await loadCustomers(pagination.page);
    } catch (err) {
      setPaymentError(err.message || "Failed to save payment method");
    } finally {
      setSavingPayment(false);
    }
  }

  async function deletePayment(pmId) {
    if (!selectedId || !pmId) return;
    if (!window.confirm("Delete this payment method?")) return;
    setPaymentError(null);
    try {
      const res = await fetch(`/api/customers/${selectedId}/payment-methods/${pmId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to delete");
      if (editingPaymentId === pmId) {
        setEditingPaymentId(null);
        setShowPaymentForm(false);
        setPaymentForm(newPaymentForm());
      }
      if (viewingPayment?.id === pmId) {
        setViewingPayment(null);
      }
      await loadDetail(selectedId);
      await loadCustomers(pagination.page);
    } catch (err) {
      setPaymentError(err.message || "Failed to delete");
    }
  }

  async function linkLeadPayment(leadId, rawPmId) {
    if (!selectedId || !leadId) return;
    setLinkingLeadId(leadId);
    setPaymentError(null);
    try {
      const customerPaymentMethodId =
        rawPmId === "" || rawPmId == null ? null : Number(rawPmId);
      const res = await fetch(`/api/customers/${selectedId}/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customerPaymentMethodId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to link payment method");
      await loadDetail(selectedId);
    } catch (err) {
      setPaymentError(err.message || "Failed to link payment method");
    } finally {
      setLinkingLeadId(null);
    }
  }

  async function setLeadChargeStatus(leadId, status, { reason = null, processor = null } = {}) {
    if (!selectedId || !leadId) return;
    setChargingLeadId(leadId);
    setPaymentError(null);
    try {
      const payload = {
        leadPaymentChargeStatus: status,
        leadPaymentProcessor: processor,
      };
      if (status === "declined") payload.leadPaymentDeclineReason = reason;
      const res = await fetch(`/api/customers/${selectedId}/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to update charge status");
      setChargeModal(null);
      setChargeProcessor("");
      setDeclineReason("");
      await loadDetail(selectedId);
    } catch (err) {
      setPaymentError(err.message || "Failed to update charge status");
    } finally {
      setChargingLeadId(null);
    }
  }

  function openChargeModal(lead, status) {
    setChargeProcessor(lead?.leadPaymentProcessor || "");
    setDeclineReason("");
    setChargeModal({ lead, status });
  }

  function closeChargeModal() {
    setChargeModal(null);
    setChargeProcessor("");
    setDeclineReason("");
  }

  async function submitChargeModal() {
    if (!chargeModal) return;
    const processor = chargeProcessor.trim();
    if (!processor) {
      setPaymentError("Payment processor is required");
      return;
    }
    if (chargeModal.status === "declined") {
      const reason = declineReason.trim();
      if (!reason) {
        setPaymentError("Decline reason is required");
        return;
      }
      await setLeadChargeStatus(chargeModal.lead.id, "declined", { reason, processor });
      return;
    }
    await setLeadChargeStatus(chargeModal.lead.id, chargeModal.status, { processor });
  }

  function openAmountModal(lead) {
    setAmountDraft(
      lead?.leadPaymentChargeAmount != null ? String(lead.leadPaymentChargeAmount) : "",
    );
    setAmountModalLead(lead);
    setPaymentError(null);
  }

  function closeAmountModal() {
    setAmountModalLead(null);
    setAmountDraft("");
  }

  async function submitAmountModal() {
    if (!selectedId || !amountModalLead?.id) return;
    setSavingAmountLeadId(amountModalLead.id);
    setPaymentError(null);
    try {
      const res = await fetch(`/api/customers/${selectedId}/leads/${amountModalLead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          leadPaymentChargeAmount: amountDraft.trim() === "" ? null : amountDraft.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to update charge amount");
      closeAmountModal();
      await loadDetail(selectedId);
    } catch (err) {
      setPaymentError(err.message || "Failed to update charge amount");
    } finally {
      setSavingAmountLeadId(null);
    }
  }

  async function openLeadSidebar(leadId) {
    if (!leadId) return;
    setLoadingLeadId(leadId);
    setPaymentError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}`, { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load lead");
      setSelectedLead(json.lead || null);
    } catch (err) {
      setSelectedLead(null);
      setPaymentError(err.message || "Failed to load lead");
    } finally {
      setLoadingLeadId(null);
    }
  }

  async function copyLeadLink(leadId) {
    if (!leadId) return;
    const url = `${window.location.origin}/leads/${leadId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(textarea);
      }
    }
    setCopiedLeadId(leadId);
    window.setTimeout(() => {
      setCopiedLeadId((prev) => (prev === leadId ? null : prev));
    }, 2000);
  }

  function handleLeadUpdated(updated) {
    setSelectedLead((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
    setEditingLead((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
    if (selectedId) void loadDetail(selectedId);
  }

  const customer = detail?.customer;
  const paymentMethods = detail?.paymentMethods || [];
  const leads = detail?.leads || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {[
          { id: "customers", label: "Customers" },
          { id: "processors", label: "Payment processors" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveView(tab.id)}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
              activeView === tab.id
                ? "bg-violet-600 text-white"
                : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }`}
            aria-pressed={activeView === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeView === "processors" ? (
        <PaymentProcessorsAdminPanel onProcessorsUpdated={loadPaymentProcessors} />
      ) : null}

      {activeView === "customers" ? (
      <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-36">
            <label htmlFor="customer-search-by" className={labelClass}>
              Search by
            </label>
            <select
              id="customer-search-by"
              value={searchBy}
              onChange={(e) => {
                setSearchBy(e.target.value);
                setSearchError(null);
                setSearchInput("");
                setSelectedId(null);
                if (q) setQ("");
              }}
              className={inputClass}
            >
              {SEARCH_BY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="relative min-w-[180px] flex-1">
            <label htmlFor="customer-search" className={labelClass}>
              {searchBy === "last4"
                ? "Phone last 4"
                : searchBy === "name"
                  ? "Customer name"
                  : searchBy === "phone"
                    ? "Phone"
                    : "Search"}
            </label>
            <input
              id="customer-search"
              value={searchInput}
              onChange={(e) => {
                const next = e.target.value;
                if (searchBy === "phone") {
                  setSearchInput(formatLandline(next));
                } else if (searchBy === "last4") {
                  setSearchInput(digitsOnly(next).slice(0, 4));
                } else {
                  setSearchInput(next);
                }
                if (searchError) setSearchError(null);
              }}
              className={inputClass}
              placeholder={searchPlaceholder}
              inputMode={searchBy === "last4" || searchBy === "phone" ? "numeric" : "text"}
              maxLength={
                searchBy === "last4" ? 4 : searchBy === "phone" ? 12 : 128
              }
              aria-invalid={Boolean(searchError)}
            />
            {searchError ? (
              <p className="pointer-events-none absolute left-0 top-full z-10 mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                {searchError}
              </p>
            ) : null}
          </div>
          <div className="w-full sm:min-w-[200px] sm:flex-1">
            <label htmlFor="customer-sale-filter" className={labelClass}>
              Sale status
            </label>
            <select
              id="customer-sale-filter"
              value={saleFilter}
              onChange={(e) => {
                setSaleFilter(e.target.value);
                setSelectedId(null);
              }}
              className={inputClass}
            >
              {SALE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:min-w-[200px] sm:flex-1">
            <label htmlFor="customer-shift-filter" className={labelClass}>
              Shift
            </label>
            <select
              id="customer-shift-filter"
              value={shiftFilter}
              onChange={(e) => {
                setShiftFilter(e.target.value);
                setSelectedId(null);
              }}
              className={inputClass}
            >
              <option value="all">Combined (all)</option>
              <option value="day">Day shift</option>
              <option value="night">Night shift</option>
            </select>
          </div>
          <div className="w-full sm:min-w-[200px] sm:flex-1">
            <label htmlFor="customer-payment-filter" className={labelClass}>
              Payment
            </label>
            <select
              id="customer-payment-filter"
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value);
                setSelectedId(null);
              }}
              className={inputClass}
            >
              {PAYMENT_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:min-w-[200px] sm:flex-1">
            <label htmlFor="customer-charge-filter" className={labelClass}>
              Charge status
            </label>
            <select
              id="customer-charge-filter"
              value={chargeFilter}
              onChange={(e) => {
                setChargeFilter(e.target.value);
                setSelectedId(null);
              }}
              className={inputClass}
            >
              {CHARGE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-36 shrink-0">
            <label htmlFor="customer-state-filter" className={labelClass}>
              State
            </label>
            <select
              id="customer-state-filter"
              value={stateFilter}
              onChange={(e) => {
                setStateFilter(e.target.value);
                setSelectedId(null);
              }}
              className={inputClass}
            >
              <option value="all">All states</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:min-w-[180px] sm:w-44">
            <label htmlFor="customer-date-field" className={labelClass}>
              Date field
            </label>
            <select
              id="customer-date-field"
              value={dateField}
              onChange={(e) => {
                setDateField(e.target.value);
                setSelectedId(null);
              }}
              className={inputClass}
            >
              {DATE_FIELD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:min-w-[180px] sm:w-44">
            <label htmlFor="customer-date-range" className={labelClass}>
              Date range
            </label>
            <select
              id="customer-date-range"
              value={rangePreset}
              onChange={(e) => onRangePresetChange(e.target.value)}
              className={inputClass}
            >
              {DATE_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {rangePreset === "custom" ? (
            <>
              <div className="w-full sm:w-40">
                <label htmlFor="customer-from-date" className={labelClass}>
                  From
                </label>
                <input
                  id="customer-from-date"
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => {
                    setRangePreset("custom");
                    setRangeFrom(e.target.value);
                  }}
                  className={inputClass}
                />
              </div>
              <div className="w-full sm:w-40">
                <label htmlFor="customer-to-date" className={labelClass}>
                  To
                </label>
                <input
                  id="customer-to-date"
                  type="date"
                  value={rangeTo}
                  onChange={(e) => {
                    setRangePreset("custom");
                    setRangeTo(e.target.value);
                  }}
                  className={inputClass}
                />
              </div>
            </>
          ) : null}
          <button type="submit" className={btnPrimary}>
            Search
          </button>
          {hasActiveFilters ? (
            <button type="button" className={btnSecondary} onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </form>
        {appliedFrom && appliedTo ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Lead{" "}
            {(DATE_FIELD_OPTIONS.find((o) => o.value === dateField)?.label || "Updated").toLowerCase()}{" "}
            in <span className="font-medium">{appliedFrom}</span>
            {" — "}
            <span className="font-medium">{appliedTo}</span>
          </p>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {loading
                ? "Loading customers…"
                : pagination.total > 0
                  ? `Showing ${customers.length} of ${pagination.total} customers`
                  : "No customers yet"}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrevPage}
                disabled={!pagination.hasPrev || loading}
                className={btnPage}
              >
                Prev
              </button>
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Page {pagination.page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={onNextPage}
                disabled={!pagination.hasNext || loading}
                className={btnPage}
              >
                Next
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Leads</th>
                  <th className="px-4 py-3 font-semibold">Payments</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                      Loading…
                    </td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                      No customers found.
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr
                      key={c.id}
                      className={`cursor-pointer border-t border-zinc-100 dark:border-zinc-800 ${
                        selectedId === c.id
                          ? "bg-violet-50/70 dark:bg-violet-950/30"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                      }`}
                      onClick={() => setSelectedId(c.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {c.displayName || c.fullName || "—"}
                        </div>
                        <div className="font-mono text-xs text-zinc-500">
                          {formatLandline(c.phone) || c.phone}
                        </div>
                        <div className="text-xs text-zinc-500">{c.serviceLabel || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                        {[c.city, c.state, c.zipCode].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {c.leadCount ?? 0}
                        </div>
                        <div className="text-xs text-zinc-500">
                          Last {formatWhen(c.lastLeadAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                        {c.paymentMethodCount ?? 0}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {pagination.pageSize} per page
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrevPage}
                disabled={!pagination.hasPrev || loading}
                className={btnPage}
              >
                Prev
              </button>
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Page {pagination.page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={onNextPage}
                disabled={!pagination.hasNext || loading}
                className={btnPage}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {!selectedId ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700">
              Select a customer to view lead history and payment methods.
            </div>
          ) : detailLoading ? (
            <div className="rounded-2xl border border-zinc-200 px-6 py-16 text-center text-sm text-zinc-500 dark:border-zinc-800">
              Loading customer…
            </div>
          ) : !customer ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {paymentError || "Customer not found"}
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  {customer.displayName || customer.fullName || "Customer"}
                </h2>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-zinc-500">Phone</dt>
                    <dd className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                      {formatLandline(customer.phone) || customer.phone}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Service</dt>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                      {customer.serviceLabel || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Location</dt>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                      {[customer.city, customer.state, customer.zipCode].filter(Boolean).join(", ") ||
                        "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Lead history</dt>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                      {customer.leadCount ?? 0} lead{(customer.leadCount ?? 0) === 1 ? "" : "s"}
                      {customer.firstLeadAt
                        ? ` · first ${formatWhen(customer.firstLeadAt)}`
                        : ""}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                    Payment methods
                  </h3>
                  <button type="button" className={btnSecondary} onClick={startAddPayment}>
                    Add payment
                  </button>
                </div>

                {paymentError ? (
                  <p className="mt-3 text-sm text-red-600 dark:text-red-300">{paymentError}</p>
                ) : null}

                <ul className="mt-3 space-y-2">
                  {paymentMethods.length === 0 ? (
                    <li className="text-sm text-zinc-500">No payment methods saved.</li>
                  ) : (
                    paymentMethods.map((pm) => (
                      <li
                        key={pm.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                      >
                        <div>
                          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {paymentTypeLabel(pm.type)}
                            {pm.isDefault ? (
                              <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                                Default
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-zinc-500">{paymentSummary(pm)}</div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={btnSecondary}
                            onClick={() => startViewPayment(pm)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className={btnSecondary}
                            onClick={() => startEditPayment(pm)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                            onClick={() => void deletePayment(pm.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))
                  )}
                </ul>

                {viewingPayment ? (
                  <div className="mt-4 space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-800 dark:bg-violet-950/20">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        View payment method
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={() => startEditPayment(viewingPayment)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={() => setViewingPayment(null)}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    <PaymentViewDetails pm={viewingPayment} />
                  </div>
                ) : null}

                {showPaymentForm && !viewingPayment ? (
                <form onSubmit={savePayment} className="mt-4 space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {editingPaymentId ? "Edit payment method" : "New payment method"}
                  </p>
                  <label className={labelClass}>
                    Type
                    <select
                      className={inputClass}
                      value={paymentForm.type}
                      onChange={(e) => onPaymentTypeChange(e.target.value)}
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
                              brand,
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
                          autoComplete="off"
                          placeholder="•••• •••• •••• ••••"
                          maxLength={23}
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
                        >
                          <option value="">Select card type</option>
                          {CARD_TYPES.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                          {paymentForm.cardType &&
                          !CARD_TYPES.some((opt) => opt.value === paymentForm.cardType) ? (
                            <option value={paymentForm.cardType}>{paymentForm.cardType}</option>
                          ) : null}
                        </select>
                      </label>
                      <label className={labelClass}>
                        Brand
                        <select
                          className={inputClass}
                          value={paymentForm.brand}
                          onChange={(e) =>
                            setPaymentForm((prev) => ({ ...prev, brand: e.target.value }))
                          }
                        >
                          <option value="">Select brand</option>
                          {CARD_BRANDS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                          {paymentForm.brand &&
                          !CARD_BRANDS.some((opt) => opt.value === paymentForm.brand) ? (
                            <option value={paymentForm.brand}>{paymentForm.brand}</option>
                          ) : null}
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
                            // Keep caret after "MM/" when month auto-completes (e.g. 2 → 02/).
                            requestAnimationFrame(() => {
                              const pos = next.length;
                              try {
                                input.setSelectionRange(pos, pos);
                              } catch {
                                // ignore unsupported selection on some inputs
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
                          autoComplete="off"
                          maxLength={5}
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
                          autoComplete="off"
                          placeholder="•••"
                          maxLength={4}
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
                        />
                      </label>
                    </div>
                  ) : null}

                  {paymentForm.type === "pos_link" ? (
                    <label className={labelClass}>
                      Email
                      <input
                        className={inputClass}
                        type="email"
                        value={paymentForm.email}
                        onChange={(e) =>
                          setPaymentForm((prev) => ({ ...prev, email: e.target.value }))
                        }
                        placeholder="customer@example.com"
                        autoComplete="off"
                      />
                    </label>
                  ) : null}

                  <label className={labelClass}>
                    Notes
                    <textarea
                      className={inputClass}
                      rows={2}
                      value={paymentForm.notes}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))
                      }
                    />
                  </label>

                  <label className="inline-flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                    <input
                      type="checkbox"
                      checked={paymentForm.isDefault}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, isDefault: e.target.checked }))
                      }
                    />
                    Default payment method
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className={btnPrimary} disabled={savingPayment}>
                      {savingPayment
                        ? "Saving…"
                        : editingPaymentId
                          ? "Update payment"
                          : "Save payment"}
                    </button>
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={closePaymentForm}
                      disabled={savingPayment}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
                ) : null}
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  Lead history
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Link a saved payment method, then log Charged, Declined, or Chargeback.
                </p>
                <ul className="mt-3 space-y-2">
                  {leads.length === 0 ? (
                    <li className="text-sm text-zinc-500">No leads linked yet.</li>
                  ) : (
                    leads.map((lead) => {
                      const linkedPm = paymentMethods.find(
                        (pm) => pm.id === lead.customerPaymentMethodId,
                      );
                      const phaseMeta = getLeadPhaseMeta(lead.leadPhase || "active");
                      const phaseTone = phaseMeta.tone || "zinc";
                      const phaseBadgeClass =
                        WORKFLOW_BADGE_CLASS[phaseTone] || WORKFLOW_BADGE_CLASS.zinc;
                      const paymentMeta = lead.leadPaymentMethod
                        ? getLeadPaymentMethodMeta(lead.leadPaymentMethod)
                        : null;
                      const paymentTone = paymentMeta?.tone || "zinc";
                      const paymentBadgeClass =
                        WORKFLOW_BADGE_CLASS[paymentTone] || WORKFLOW_BADGE_CLASS.zinc;
                      const chargeMeta = lead.leadPaymentChargeStatus
                        ? getLeadPaymentChargeStatusMeta(lead.leadPaymentChargeStatus)
                        : null;
                      const chargeBadgeClass = chargeMeta
                        ? WORKFLOW_BADGE_CLASS[chargeMeta.tone] || WORKFLOW_BADGE_CLASS.zinc
                        : "";
                      const processorMeta = lead.leadPaymentProcessor
                        ? getLeadPaymentProcessorMeta(
                            lead.leadPaymentProcessor,
                            paymentProcessors,
                          )
                        : null;
                      const processorBadgeClass = processorMeta
                        ? WORKFLOW_BADGE_CLASS[processorMeta.tone] || WORKFLOW_BADGE_CLASS.zinc
                        : "";
                      const chargeBusy =
                        linkingLeadId === lead.id || chargingLeadId === lead.id;
                      return (
                        <li
                          key={lead.id}
                          className="rounded-xl border border-zinc-200 px-3 py-3 text-sm dark:border-zinc-800"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                                  #{lead.id}
                                </span>
                                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                  {lead.fullName}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-zinc-500">
                                {formatWhen(lead.createdAt)}
                              </span>
                              <IconTooltipButton
                                title={
                                  copiedLeadId === lead.id ? "Link copied!" : "Copy lead link"
                                }
                                onClick={() => void copyLeadLink(lead.id)}
                              >
                                {copiedLeadId === lead.id ? <CheckIcon /> : <CopyLinkIcon />}
                              </IconTooltipButton>
                              <IconTooltipButton
                                title={loadingLeadId === lead.id ? "Loading…" : "View lead"}
                                disabled={loadingLeadId === lead.id}
                                onClick={() => void openLeadSidebar(lead.id)}
                              >
                                <ViewIcon />
                              </IconTooltipButton>
                            </div>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${phaseBadgeClass}`}
                            >
                              {phaseMeta.label}
                            </span>
                            {(lead.leadProgressTags || []).map((tag) => {
                              const tagMeta = getLeadProgressTagMeta(tag);
                              const tagClass =
                                WORKFLOW_BADGE_CLASS[tagMeta.tone] || WORKFLOW_BADGE_CLASS.zinc;
                              const taggedAt =
                                tag === "verified"
                                  ? lead.verifiedAt
                                  : tag === "processed"
                                    ? lead.processedAt
                                    : tag === "sale_done"
                                      ? lead.saleDoneAt
                                      : null;
                              return (
                                <span
                                  key={tag}
                                  className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${tagClass}`}
                                  title={taggedAt ? `Tagged ${formatWhen(taggedAt)}` : undefined}
                                >
                                  {tagMeta.label}
                                </span>
                              );
                            })}
                            {paymentMeta ? (
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${paymentBadgeClass}`}
                              >
                                {paymentMeta.label}
                              </span>
                            ) : null}
                            <span className="inline-flex items-center gap-1.5">
                              {lead.leadPaymentChargeAmount != null ? (
                                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold tabular-nums text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100">
                                  {formatLeadPaymentChargeAmount(lead.leadPaymentChargeAmount)}
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-500">No amount</span>
                              )}
                              <button
                                type="button"
                                className="rounded-lg border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                disabled={savingAmountLeadId === lead.id}
                                onClick={() => openAmountModal(lead)}
                              >
                                {savingAmountLeadId === lead.id ? "…" : "Change"}
                              </button>
                            </span>
                            {chargeMeta ? (
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${chargeBadgeClass}`}
                                title={
                                  lead.leadPaymentChargeStatus === "declined" &&
                                  lead.leadPaymentDeclineReason
                                    ? lead.leadPaymentDeclineReason
                                    : undefined
                                }
                              >
                                {chargeMeta.label}
                              </span>
                            ) : null}
                            {processorMeta ? (
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${processorBadgeClass}`}
                              >
                                {processorMeta.label}
                              </span>
                            ) : null}
                            <span>
                              {formatLeadService(lead)} · created by {lead.createdByUsername || "—"}
                            </span>
                          </div>
                          <label className={`${labelClass} mt-3`}>
                            Linked payment method
                            <select
                              className={inputClass}
                              value={lead.customerPaymentMethodId || ""}
                              disabled={chargeBusy || paymentMethods.length === 0}
                              onChange={(e) => void linkLeadPayment(lead.id, e.target.value)}
                            >
                              <option value="">
                                {paymentMethods.length === 0
                                  ? "No payment methods saved"
                                  : "Not linked"}
                              </option>
                              {paymentMethods.map((pm) => (
                                <option key={pm.id} value={pm.id}>
                                  {paymentMethodOptionLabel(pm)}
                                </option>
                              ))}
                            </select>
                          </label>
                          {linkingLeadId === lead.id ? (
                            <p className="mt-1 text-xs text-zinc-500">Saving…</p>
                          ) : linkedPm ? (
                            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                              {paymentMethodOptionLabel(linkedPm)}
                            </p>
                          ) : null}
                          {linkedPm ? (
                            <div className="mt-3">
                              <p className={`${labelClass} mb-1.5`}>Charge status</p>
                              <div className="flex flex-wrap gap-2">
                                {LEAD_PAYMENT_CHARGE_STATUSES.map((status) => {
                                  const active = lead.leadPaymentChargeStatus === status.value;
                                  const toneClass =
                                    WORKFLOW_BADGE_CLASS[status.tone] || WORKFLOW_BADGE_CLASS.zinc;
                                  return (
                                    <button
                                      key={status.value}
                                      type="button"
                                      disabled={chargeBusy}
                                      onClick={() => openChargeModal(lead, status.value)}
                                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                                        active
                                          ? toneClass
                                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                      }`}
                                      aria-pressed={active}
                                    >
                                      {status.label}
                                    </button>
                                  );
                                })}
                              </div>
                              {processorMeta ? (
                                <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                                  Latest processor: {processorMeta.label}
                                </p>
                              ) : null}
                              {lead.leadPaymentChargeStatus === "declined" &&
                              lead.leadPaymentDeclineReason ? (
                                <p className="mt-1.5 text-xs text-red-700 dark:text-red-300">
                                  Latest reason: {lead.leadPaymentDeclineReason}
                                </p>
                              ) : null}
                              {chargingLeadId === lead.id ? (
                                <p className="mt-1 text-xs text-zinc-500">Saving…</p>
                              ) : null}
                            </div>
                          ) : null}
                          {(lead.paymentChargeLogGroups || []).length > 0 ? (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                Payment logs by card
                              </p>
                              {lead.paymentChargeLogGroups.map((group) => {
                                const groupKey = group.customerPaymentMethodId ?? "unknown";
                                const highlighted = group.isCurrent || group.isCharged;
                                return (
                                  <div
                                    key={groupKey}
                                    className={`rounded-xl border px-3 py-2 ${
                                      highlighted
                                        ? group.isCharged
                                          ? "border-emerald-400 bg-emerald-50/90 ring-1 ring-emerald-300/80 dark:border-emerald-600 dark:bg-emerald-950/40 dark:ring-emerald-700/60"
                                          : "border-violet-400 bg-violet-50/90 ring-1 ring-violet-300/80 dark:border-violet-600 dark:bg-violet-950/40 dark:ring-violet-700/60"
                                        : "border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/50"
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p
                                        className={`text-xs font-semibold ${
                                          highlighted
                                            ? group.isCharged
                                              ? "text-emerald-900 dark:text-emerald-100"
                                              : "text-violet-900 dark:text-violet-100"
                                            : "text-zinc-800 dark:text-zinc-200"
                                        }`}
                                      >
                                        {group.label}
                                      </p>
                                      {group.isCurrent ? (
                                        <span className="inline-flex rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-900 dark:border-violet-700 dark:bg-violet-950/70 dark:text-violet-100">
                                          Current
                                        </span>
                                      ) : null}
                                      {group.isCharged ? (
                                        <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-100">
                                          Charged
                                        </span>
                                      ) : null}
                                    </div>
                                    {group.logs.length === 0 ? (
                                      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                                        No charge logs yet.
                                      </p>
                                    ) : (
                                      <ul className="mt-2 space-y-2">
                                        {group.logs.map((log) => (
                                          <li
                                            key={log.id}
                                            className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300"
                                          >
                                            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                                              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                                {log.body}
                                              </span>
                                              <time className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
                                                {formatWhen(log.createdAt)}
                                              </time>
                                            </div>
                                            {log.username ? (
                                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                                by {log.username}
                                              </p>
                                            ) : null}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </li>
                      );
                    })
                  )}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>

      {chargeModal ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60] bg-zinc-950/50"
            aria-label="Close charge form"
            onClick={closeChargeModal}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950">
              <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                {chargeModal.status === "declined"
                  ? "Payment declined"
                  : chargeModal.status === "chargeback"
                    ? "Payment chargeback"
                    : "Payment charged"}
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Select the payment processor for {chargeModal.lead.fullName || "this lead"}.
                {chargeModal.status === "declined"
                  ? " You can log declines multiple times."
                  : ""}
              </p>
              <label className={`${labelClass} mt-4`}>
                Payment processor *
                <select
                  className={inputClass}
                  value={chargeProcessor}
                  onChange={(e) => setChargeProcessor(e.target.value)}
                  autoFocus
                >
                  <option value="">Select processor…</option>
                  {activePaymentProcessors.map((processor) => (
                    <option key={processor.code} value={processor.code}>
                      {processor.shortCode}
                    </option>
                  ))}
                </select>
              </label>
              {chargeModal.status === "declined" ? (
                <label className={`${labelClass} mt-3`}>
                  Decline reason *
                  <textarea
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    rows={4}
                    className={`${inputClass} min-h-[96px] resize-y`}
                    placeholder="Decline reason…"
                  />
                </label>
              ) : null}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={closeChargeModal} className={btnSecondary}>
                  Close
                </button>
                <button
                  type="button"
                  disabled={
                    chargingLeadId === chargeModal.lead.id ||
                    !chargeProcessor ||
                    (chargeModal.status === "declined" && !declineReason.trim())
                  }
                  onClick={() => void submitChargeModal()}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                    chargeModal.status === "declined"
                      ? "bg-red-600 hover:bg-red-500"
                      : chargeModal.status === "chargeback"
                        ? "bg-amber-600 hover:bg-amber-500"
                        : "bg-emerald-600 hover:bg-emerald-500"
                  }`}
                >
                  {chargingLeadId === chargeModal.lead.id
                    ? "Saving…"
                    : chargeModal.status === "declined"
                      ? "Save declined"
                      : chargeModal.status === "chargeback"
                        ? "Save chargeback"
                        : "Save charged"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {amountModalLead ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60] bg-zinc-950/50"
            aria-label="Close amount form"
            onClick={closeAmountModal}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950">
              <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                Change charge amount
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Update the charge amount for {amountModalLead.fullName || `lead #${amountModalLead.id}`}.
              </p>
              <label className={`${labelClass} mt-4`}>
                Charge amount
                <input
                  className={inputClass}
                  value={amountDraft}
                  onChange={(e) => setAmountDraft(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  autoFocus
                />
              </label>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={closeAmountModal} className={btnSecondary}>
                  Close
                </button>
                <button
                  type="button"
                  disabled={savingAmountLeadId === amountModalLead.id}
                  onClick={() => void submitAmountModal()}
                  className={btnPrimary}
                >
                  {savingAmountLeadId === amountModalLead.id ? "Saving…" : "Save amount"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {selectedLead ? (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onLeadUpdated={handleLeadUpdated}
          onEdit={() => setEditingLead(selectedLead)}
          showFullPageLink={false}
          workflowTagLookup={workflowTagLookup}
          preferShortLabels={preferShortLabels}
          canAssignLead
          canEditChargeAmount
        />
      ) : null}

      {editingLead ? (
        <LeadEditModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onSaved={(updated) => {
            handleLeadUpdated(updated);
            setEditingLead(null);
          }}
        />
      ) : null}
      </>
      ) : null}
    </div>
  );
}
