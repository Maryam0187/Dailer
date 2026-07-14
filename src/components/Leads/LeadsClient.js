"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { startOutgoingCall } from "@/lib/startOutgoingCall";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";
import { digitsOnly, formatLandline, validatePhone } from "@/lib/phoneFormat";
import { validateListSearchQuery } from "@/lib/listSearchValidation";
import {
  LEAD_CONTACT_TAGS,
  LEAD_PHASES,
  LEAD_PROGRESS_MISSING_FILTERS,
  LEAD_PROGRESS_TAGS,
  WORKFLOW_BADGE_CLASS,
} from "@/lib/leadWorkflow";
import {
  ADMIN_SHORT_LABELS_STORAGE_KEY,
  buildWorkflowTagLookup,
  collectLeadWorkflowIndicators,
  formatLeadWorkflowTooltipSummary,
  resolvePreferShortLabels,
  workflowTagDisplayLabel,
} from "@/lib/workflowTagLabels";
import { canUseLeadFilters, canViewLeadStats, hasFullLeadAccess } from "@/lib/leadRoles";
import { formatLeadPhoneDisplay, shouldRedactLeadPhones } from "@/lib/maskPhone";
import { formatLeadService, SERVICE_TYPE_OPTIONS } from "@/lib/leadService";
import StateSelectField, { StateLocalTime } from "@/components/Leads/StateSelectField";
import { US_STATES } from "@/lib/usStates";
import CopyPhoneButton from "@/components/Leads/CopyPhoneButton";
import IconTooltipButton, { CallIcon, EditIcon, ExpandIcon, ViewIcon } from "@/components/Leads/IconTooltipButton";
import LeadDetailPanel from "@/components/Leads/LeadDetailPanel";
import LeadEditModal from "@/components/Leads/LeadEditModal";
import RichTextField from "@/components/Leads/RichTextField";
import LeadsStatsPanel from "@/components/Leads/LeadsStatsPanel";
import WorkflowTagsAdminPanel from "@/components/Leads/WorkflowTagsAdminPanel";
import WorkflowStatusLegend from "@/components/Leads/WorkflowStatusLegend";
import WorkflowSwatch from "@/components/Leads/WorkflowSwatch";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";

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
  if (preset === "all") {
    return { from: "", to: "" };
  }
  return { from: "", to: "" };
}

function buildPhaseFilterOptions(tags) {
  const options = buildWorkflowFilterOptions(tags, "phase", "All sales", LEAD_PHASES);
  if (options[0]?.id === "all") {
    options[0].shortLabel = "All";
  }
  return options;
}

function workflowFilterDisplayLabel(options, id, preferShort) {
  const option = options.find((f) => f.id === id) || options[0];
  if (!option) return "All";
  return preferShort ? option.shortLabel || option.label : option.label;
}

function buildWorkflowFilterOptions(tags, category, allLabel, fallback) {
  const fromDb = (tags || [])
    .filter((t) => t.category === category)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((t) => ({ id: t.tagKey, label: t.fullLabel, shortLabel: t.shortLabel }));
  const options = fromDb.length
    ? fromDb
    : fallback.map((t) => ({ id: t.value, label: t.label, shortLabel: t.label }));
  return [{ id: "all", label: allLabel, shortLabel: allLabel }, ...options];
}

function buildProgressFilterOptions(tags) {
  const base = buildWorkflowFilterOptions(tags, "progress", "All progress", LEAD_PROGRESS_TAGS);
  const tagLabel = (tagKey, field) => {
    const row = (tags || []).find((t) => t.category === "progress" && t.tagKey === tagKey);
    if (row) return row[field];
    return LEAD_PROGRESS_TAGS.find((t) => t.value === tagKey)?.label || tagKey;
  };
  const missing = LEAD_PROGRESS_MISSING_FILTERS.map((spec) => ({
    id: spec.value,
    label: spec.label,
    shortLabel: `Need ${tagLabel(spec.tagKey, "shortLabel")}`,
    missing: true,
  }));
  return [...base, ...missing];
}

function workflowFilterLabel(options, id) {
  return options.find((f) => f.id === id)?.label || options[0]?.label || "All";
}

const FILTER_CHIP_ACTIVE_CLASS =
  "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100";
const FILTER_CHIP_CLASS =
  "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800";

function filterChipClass(active) {
  return `rounded-lg border px-3 py-1.5 text-sm font-semibold ${active ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_CLASS}`;
}

const SEARCH_BY_OPTIONS = [
  { value: "all", label: "All", placeholder: "Phone, name, or last 4" },
  { value: "phone", label: "Phone", placeholder: "Phone number" },
  { value: "name", label: "Name", placeholder: "Lead name" },
  { value: "last4", label: "Last 4", placeholder: "Phone last 4 digits" },
];

function hasActiveLeadFilters({
  supervisorFilter,
  agentFilter,
  assignedScopeFilter,
  processorScopeFilter,
  leadPhaseFilter,
  leadProgressTagFilter,
  leadContactTagFilter,
  stateFilter,
  rangePreset,
  q,
}) {
  return (
    supervisorFilter !== "all" ||
    agentFilter !== "all" ||
    assignedScopeFilter !== "all" ||
    processorScopeFilter !== "all" ||
    leadPhaseFilter !== "all" ||
    leadProgressTagFilter !== "all" ||
    leadContactTagFilter !== "all" ||
    stateFilter !== "all" ||
    rangePreset !== "all" ||
    Boolean(q)
  );
}

function resolveLeadListDateField(leadPhaseFilter, sortBy) {
  if (sortBy === "updatedAt") return "updated";
  if (leadPhaseFilter === "closed" || leadPhaseFilter === "cancelled") return "updated";
  return "created";
}

function dateRangeHint(leadPhaseFilter, sortBy) {
  if (sortBy === "updatedAt") return "updated in";
  if (leadPhaseFilter === "closed") return "closed in";
  if (leadPhaseFilter === "cancelled") return "cancelled in";
  return "created in";
}

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";
const LEADS_PAGE_SIZE = 25;

function formatLeadName(lead) {
  return lead.fullName?.trim() || "—";
}


function formatLeadLocation(lead) {
  const city = lead.city?.trim();
  const state = lead.state?.trim();
  const zip = lead.zipCode?.trim();
  const stateZip = [state, zip].filter(Boolean).join(" ");
  if (city && stateZip) return `${city}, ${stateZip}`;
  if (city) return city;
  if (stateZip) return stateZip;
  return "—";
}

const tableHeadClass = "whitespace-nowrap px-2.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide";
const tableCellClass = "px-2.5 py-2.5 text-xs";
const fieldErrorClass = "mt-1 text-xs font-medium text-red-600 dark:text-red-400";

function inputClassForValidation(baseClass, isValid) {
  if (isValid) return baseClass;
  return `${baseClass} border-red-400 focus:border-red-500 focus:ring-red-500/25 dark:border-red-500/70`;
}

function StatusPill({ lead, workflowTagLookup, preferShortLabels }) {
  const indicators = collectLeadWorkflowIndicators(lead, workflowTagLookup, preferShortLabels);
  const summary = formatLeadWorkflowTooltipSummary(lead, workflowTagLookup, preferShortLabels);
  return (
    <span className="flex flex-wrap items-center gap-1" title={summary} aria-label={summary}>
      {indicators.map((item) => {
        if (item.category === "phase") {
          const phaseLabel = workflowTagDisplayLabel(workflowTagLookup, "phase", item.tagKey, {
            preferShort: preferShortLabels,
            fallback: item.label,
          });
          return (
            <span
              key={`${item.category}-${item.tagKey}`}
              title={item.label}
              className={`inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none ${WORKFLOW_BADGE_CLASS[item.tone] || WORKFLOW_BADGE_CLASS.zinc}`}
            >
              {phaseLabel}
            </span>
          );
        }
        return (
          <WorkflowSwatch
            key={`${item.category}-${item.tagKey}`}
            category={item.category}
            tone={item.tone}
            title={item.label}
          />
        );
      })}
    </span>
  );
}

export default function LeadsClient({ initialShowForm = false, userRole = "agent", currentUserId = null }) {
  const { session, beginSession } = useActiveCall();
  const {
    ensureRegistered,
    registered,
    sdkInitializing,
    voiceDisplaced,
    isPrimaryTab,
    expectOutgoingIncomingLeg,
  } = useTwilioVoice();

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [callingId, setCallingId] = useState(null);
  const [showForm, setShowForm] = useState(initialShowForm);
  const [saving, setSaving] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [editingLeadId, setEditingLeadId] = useState(null);

  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [cellNumber, setCellNumber] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [cableName, setCableName] = useState("");
  const [streamName, setStreamName] = useState("");
  const [breakdown, setBreakdown] = useState("");
  const [notes, setNotes] = useState("");
  const [supervisorFilter, setSupervisorFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [assignedScopeFilter, setAssignedScopeFilter] = useState("all");
  const [processorScopeFilter, setProcessorScopeFilter] = useState("own");
  const [leadPhaseFilter, setLeadPhaseFilter] = useState("all");
  const [leadProgressTagFilter, setLeadProgressTagFilter] = useState("all");
  const [leadContactTagFilter, setLeadContactTagFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [searchBy, setSearchBy] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchError, setSearchError] = useState(null);
  const [q, setQ] = useState("");
  const [assignableAgents, setAssignableAgents] = useState([]);
  const [filterSupervisors, setFilterSupervisors] = useState([]);
  const [saveError, setSaveError] = useState(null);
  const [activeView, setActiveView] = useState("list");
  const initialRange = getPresetRange("today");
  const [rangePreset, setRangePreset] = useState("today");
  const [rangeFrom, setRangeFrom] = useState(initialRange.from);
  const [rangeTo, setRangeTo] = useState(initialRange.to);
  const [appliedFrom, setAppliedFrom] = useState(initialRange.from);
  const [appliedTo, setAppliedTo] = useState(initialRange.to);
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: LEADS_PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [workflowTags, setWorkflowTags] = useState([]);
  const [adminShortLabels, setAdminShortLabels] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(ADMIN_SHORT_LABELS_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const workflowTagLookup = useMemo(() => buildWorkflowTagLookup(workflowTags), [workflowTags]);
  const phaseFilterOptions = useMemo(() => buildPhaseFilterOptions(workflowTags), [workflowTags]);
  const progressFilterOptions = useMemo(() => buildProgressFilterOptions(workflowTags), [workflowTags]);
  const contactFilterOptions = useMemo(
    () => buildWorkflowFilterOptions(workflowTags, "contact", "All outcomes", LEAD_CONTACT_TAGS),
    [workflowTags],
  );
  const visibleMissingProgressOptions = useMemo(
    () =>
      progressFilterOptions.filter(
        (option) => option.missing && !(leadPhaseFilter === "closed" && option.id === "missing_sale_done"),
      ),
    [progressFilterOptions, leadPhaseFilter],
  );

  const showLeadStats = canViewLeadStats(userRole);
  const isAdmin = userRole === "admin";
  const preferShortLabels = resolvePreferShortLabels(isAdmin, adminShortLabels);
  const showLeadFilters = canUseLeadFilters(userRole);
  const showSupervisorFilter = hasFullLeadAccess(userRole);
  const isSupervisor = userRole === "supervisor";
  const isProcessor = userRole === "processor";
  const phonesRedacted = shouldRedactLeadPhones(userRole);
  const showAgentColumn = showLeadFilters || isProcessor;
  const colSpan = showAgentColumn ? 7 : 6;

  const filteredAgents = useMemo(() => {
    if (!showSupervisorFilter || supervisorFilter === "all") return assignableAgents;
    return assignableAgents.filter(
      (a) =>
        String(a.supervisorId ?? "") === supervisorFilter ||
        (a.role === "supervisor" && String(a.id) === supervisorFilter),
    );
  }, [assignableAgents, showSupervisorFilter, supervisorFilter]);

  function creatorFilterLabel(entry) {
    if (entry.isSelf) return `${entry.username} (you)`;
    if (entry.role === "supervisor") return `${entry.username} (Supervisor)`;
    if (entry.supervisorName) return `${entry.username} (${entry.supervisorName})`;
    return entry.username;
  }

  function setAdminLabelPreference(preferShort) {
    setAdminShortLabels(preferShort);
    try {
      localStorage.setItem(ADMIN_SHORT_LABELS_STORAGE_KEY, String(preferShort));
    } catch {
      // ignore storage errors
    }
  }

  function salePhaseFilterChipLabel(option) {
    if (option.id === "all") return preferShortLabels ? option.shortLabel || option.label : option.label;
    return preferShortLabels ? option.shortLabel || option.label : option.label;
  }

  function progressFilterChipLabel(option) {
    if (option.id === "all") return option.label;
    return preferShortLabels ? option.shortLabel || option.label : option.label;
  }

  function contactFilterChipLabel(option) {
    if (option.id === "all") return option.label;
    return preferShortLabels ? option.shortLabel || option.label : option.label;
  }

  const canStartCall =
    isPrimaryTab !== false && (registered || voiceDisplaced) && !sdkInitializing;

  const addLeadValidation = useMemo(() => {
    const phoneCheck = validatePhone(phone);
    const cellCheck = cellNumber.trim() ? validatePhone(cellNumber) : { isValid: true, message: "" };
    return {
      phoneCheck,
      cellCheck,
      canSave: phoneCheck.isValid && cellCheck.isValid && Boolean(fullName.trim()),
    };
  }, [phone, cellNumber, fullName]);

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;
  const editingLead = leads.find((l) => l.id === editingLeadId) || null;

  const loadLeads = useCallback(async (targetPage, { silent = false } = {}) => {
    const resolvedPage = targetPage ?? page;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const params = new URLSearchParams();
      if (supervisorFilter && supervisorFilter !== "all") params.set("supervisorId", supervisorFilter);
      if (agentFilter && agentFilter !== "all") params.set("agentId", agentFilter);
      if (assignedScopeFilter !== "all" && (isSupervisor || supervisorFilter !== "all")) {
        params.set("assignedScope", assignedScopeFilter);
      }
      if (processorScopeFilter !== "all" && isProcessor) {
        params.set("processorScope", processorScopeFilter);
      }
      if (leadPhaseFilter && leadPhaseFilter !== "all") params.set("leadPhase", leadPhaseFilter);
      if (leadProgressTagFilter && leadProgressTagFilter !== "all") {
        params.set("leadProgressTag", leadProgressTagFilter);
      }
      if (leadContactTagFilter && leadContactTagFilter !== "all") {
        params.set("leadContactTag", leadContactTagFilter);
      }
      if (stateFilter && stateFilter !== "all") {
        params.set("state", stateFilter);
      }
      if (q.trim()) {
        params.set("q", q.trim());
        params.set("searchBy", searchBy);
      } else if (appliedFrom && appliedTo) {
        // Date range applies only when not doing a phone/name/last4 search
        params.set("fromDate", appliedFrom);
        params.set("toDate", appliedTo);
        params.set("dateField", resolveLeadListDateField(leadPhaseFilter, sortBy));
      }
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      params.set("page", String(resolvedPage));
      params.set("pageSize", String(LEADS_PAGE_SIZE));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/leads${qs}`, { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load leads");
      setLeads(json.leads || []);
      if (json.pagination) {
        setPagination(json.pagination);
        setPage(json.pagination.page || resolvedPage);
      }
    } catch (e) {
      setError(e.message || "Failed to load leads");
      if (!silent) {
        setLeads([]);
        setPagination({
          page: 1,
          pageSize: LEADS_PAGE_SIZE,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        });
      }
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [
    agentFilter,
    supervisorFilter,
    assignedScopeFilter,
    processorScopeFilter,
    isSupervisor,
    isProcessor,
    leadPhaseFilter,
    leadProgressTagFilter,
    leadContactTagFilter,
    stateFilter,
    q,
    searchBy,
    appliedFrom,
    appliedTo,
    sortBy,
    sortDir,
    page,
  ]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  const loadWorkflowTags = useCallback(async () => {
    try {
      const res = await fetch("/api/workflow-tags", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load tag labels");
      setWorkflowTags(json.tags || []);
    } catch {
      setWorkflowTags([]);
    }
  }, []);

  useEffect(() => {
    void loadWorkflowTags();
  }, [loadWorkflowTags]);

  function onPrevPage() {
    if (!pagination.hasPrev || loading) return;
    setPage((p) => Math.max(1, p - 1));
  }

  function onNextPage() {
    if (!pagination.hasNext || loading) return;
    setPage((p) => p + 1);
  }

  function onRefresh() {
    if (loading || refreshing) return;
    void loadLeads(page, { silent: true });
  }

  useEffect(() => {
    if (!showLeadFilters) return;
    (async () => {
      try {
        const res = await fetch("/api/leads/assignable-agents", { credentials: "include", cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load agents");
        const agents = json.agents || [];
        setAssignableAgents(agents);
        setFilterSupervisors(json.supervisors || []);
      } catch (e) {
        setError(e.message || "Failed to load agents");
      }
    })();
  }, [showLeadFilters]);

  useEffect(() => {
    if (agentFilter === "all") return;
    if (assignableAgents.length === 0) return;
    if (!filteredAgents.some((a) => String(a.id) === agentFilter)) {
      setAgentFilter("all");
    }
  }, [agentFilter, filteredAgents, assignableAgents.length]);

  useEffect(() => {
    if (leadPhaseFilter === "closed" && leadProgressTagFilter === "missing_sale_done") {
      setLeadProgressTagFilter("all");
    }
  }, [leadPhaseFilter, leadProgressTagFilter]);

  function onSupervisorFilterChange(nextSupervisorId) {
    setSupervisorFilter(nextSupervisorId);
    setAgentFilter("all");
    if (nextSupervisorId === "all") setAssignedScopeFilter("all");
    setPage(1);
  }

  function applyRangePreset(preset) {
    setError(null);
    setRangePreset(preset);
    setPage(1);
    if (preset === "custom") return;
    const next = getPresetRange(preset);
    setRangeFrom(next.from);
    setRangeTo(next.to);
    setAppliedFrom(next.from);
    setAppliedTo(next.to);
  }

  async function onApplyRange(e) {
    e?.preventDefault?.();
    if (rangePreset !== "custom") return;
    if (!rangeFrom || !rangeTo) {
      setError("From date and to date are required");
      return;
    }
    if (rangeFrom > rangeTo) {
      setError("From date must be on or before to date");
      return;
    }
    setError(null);
    setAppliedFrom(rangeFrom);
    setAppliedTo(rangeTo);
    setPage(1);
  }

  function onApplySearch(e) {
    e?.preventDefault?.();
    const check = validateListSearchQuery(searchBy, searchInput);
    if (!check.isValid) {
      setSearchError(check.message);
      return;
    }
    setSearchError(null);
    setError(null);
    setQ(check.normalized);
    if (check.normalized && searchBy === "phone") {
      setSearchInput(formatLandline(check.normalized));
    } else {
      setSearchInput(check.normalized);
    }
    setPage(1);
  }

  function resetForm() {
    setPhone("");
    setFullName("");
    setCellNumber("");
    setCity("");
    setState("");
    setZipCode("");
    setServiceType("");
    setCableName("");
    setStreamName("");
    setBreakdown("");
    setNotes("");
    setSaveError(null);
  }

  function handleLeadUpdated(updated) {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
  }

  async function onAddLead(e) {
    e.preventDefault();
    if (!addLeadValidation.canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        phone: digitsOnly(phone),
        fullName: fullName.trim(),
        cellNumber: cellNumber.trim() ? digitsOnly(cellNumber) : undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zipCode: zipCode.trim() || undefined,
        serviceType: serviceType || undefined,
        cableName: serviceType === "cable" ? cableName.trim() || undefined : undefined,
        streamName: serviceType === "streams" ? streamName.trim() || undefined : undefined,
        breakdown: breakdown.trim() || undefined,
        notes: notes.trim() || undefined,
        source: "manual",
      };
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to add lead");
      resetForm();
      setShowForm(false);
      setPage(1);
      await loadLeads(1);
      if (json.lead?.id) setSelectedLeadId(json.lead.id);
    } catch (err) {
      setSaveError(err.message || "Failed to add lead");
    } finally {
      setSaving(false);
    }
  }

  async function onCallLead(lead) {
    if (phonesRedacted || session || lead.status === "dnc" || lead.leadPhase === "cancelled") return;
    setCallingId(lead.id);
    setError(null);
    try {
      expectOutgoingIncomingLeg(45000);
      if (!registered || sdkInitializing) await ensureRegistered();

      const result = await startOutgoingCall({ leadId: lead.id });
      if (!result.ok) throw new Error(result.error);

      beginSession({
        callId: result.call.id,
        callOwnedByMe: true,
        callMode: result.callMode || "direct",
        callKind: "lead",
        dialMode: "agent_first",
        toNumber: result.call.toNumber,
        phoneLabel: formatLeadPhoneDisplay(lead.phone, phonesRedacted || lead.phonesRedacted),
        customerName: formatLeadName(lead),
        leadId: lead.id,
      });
    } catch (e) {
      setError(e.message || "Call failed");
    } finally {
      setCallingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {showLeadStats ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveView("list")}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
              activeView === "list"
                ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            Leads list
          </button>
          <button
            type="button"
            onClick={() => setActiveView("stats")}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
              activeView === "stats"
                ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            Lead stats
          </button>
          <button
            type="button"
            onClick={() => setActiveView("tags")}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
              activeView === "tags"
                ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            Tag labels
          </button>
          </div>
          {isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Show labels
              </span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Workflow label display">
                <button
                  type="button"
                  onClick={() => setAdminLabelPreference(false)}
                  className={filterChipClass(!adminShortLabels)}
                  aria-pressed={!adminShortLabels}
                >
                  Full
                </button>
                <button
                  type="button"
                  onClick={() => setAdminLabelPreference(true)}
                  className={filterChipClass(adminShortLabels)}
                  aria-pressed={adminShortLabels}
                >
                  Short
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showLeadStats && activeView === "stats" ? <LeadsStatsPanel /> : null}
      {showLeadStats && activeView === "tags" ? (
        <WorkflowTagsAdminPanel onTagsUpdated={loadWorkflowTags} />
      ) : null}

      {(showLeadStats ? activeView === "list" : true) ? (
        <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Your leads</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Click a lead to update status, add notes, and view activity.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v);
            setError(null);
            setSaveError(null);
          }}
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          {showForm ? "Cancel" : "+ Add lead"}
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={onAddLead}
          className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20"
        >
          <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">New lead</h3>
          <div className="grid gap-4">
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
                    !phone.trim() || addLeadValidation.phoneCheck.isValid,
                  )}
                  aria-invalid={Boolean(phone.trim()) && !addLeadValidation.phoneCheck.isValid}
                />
                {phone.trim() && !addLeadValidation.phoneCheck.isValid ? (
                  <p className={fieldErrorClass}>{addLeadValidation.phoneCheck.message}</p>
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
                    !cellNumber.trim() || addLeadValidation.cellCheck.isValid,
                  )}
                  aria-invalid={Boolean(cellNumber.trim()) && !addLeadValidation.cellCheck.isValid}
                />
                {cellNumber.trim() && !addLeadValidation.cellCheck.isValid ? (
                  <p className={fieldErrorClass}>{addLeadValidation.cellCheck.message}</p>
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
            disabled={saving || !addLeadValidation.canSave}
            className="mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save lead"}
          </button>
        </form>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <form
          onSubmit={onApplySearch}
          className="mb-4 flex flex-wrap items-end gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-700"
        >
          <div className="w-full sm:w-36">
            <label htmlFor="leads-search-by" className={labelClass}>
              Search by
            </label>
            <select
              id="leads-search-by"
              value={searchBy}
              onChange={(e) => {
                const next = e.target.value;
                setSearchBy(next);
                setSearchError(null);
                setSearchInput("");
                if (q) {
                  setQ("");
                  setPage(1);
                }
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
          <div className="relative min-w-[160px] flex-1">
            <label htmlFor="leads-search" className={labelClass}>
              {searchBy === "last4"
                ? "Phone last 4"
                : searchBy === "name"
                  ? "Name"
                  : searchBy === "phone"
                    ? "Phone"
                    : "Search"}
            </label>
            <input
              id="leads-search"
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
              placeholder={
                SEARCH_BY_OPTIONS.find((opt) => opt.value === searchBy)?.placeholder || "Search"
              }
              inputMode={searchBy === "last4" || searchBy === "phone" ? "numeric" : "text"}
              maxLength={
                searchBy === "last4" ? 4 : searchBy === "phone" ? 12 : 128
              }
              aria-invalid={Boolean(searchError)}
            />
            {searchError ? (
              <p className={`pointer-events-none absolute left-0 top-full z-10 mt-1 ${fieldErrorClass}`}>
                {searchError}
              </p>
            ) : null}
          </div>
          <div className="w-full sm:min-w-[160px] sm:flex-1">
            <label htmlFor="leads-sale-status-filter" className={labelClass}>
              Sale status
            </label>
            <select
              id="leads-sale-status-filter"
              value={leadPhaseFilter}
              onChange={(e) => {
                setLeadPhaseFilter(e.target.value);
                setPage(1);
              }}
              className={inputClass}
              aria-label="Filter by sale status"
            >
              {phaseFilterOptions.map((option) => (
                <option key={option.id} value={option.id} title={option.label}>
                  {salePhaseFilterChipLabel(option)}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:min-w-[160px] sm:flex-1">
            <label htmlFor="leads-progress-filter" className={labelClass}>
              Progress
            </label>
            <select
              id="leads-progress-filter"
              value={leadProgressTagFilter}
              onChange={(e) => {
                setLeadProgressTagFilter(e.target.value);
                setPage(1);
              }}
              className={inputClass}
              aria-label="Filter by progress"
            >
              {progressFilterOptions
                .filter((option) => !option.missing)
                .map((option) => (
                  <option key={option.id} value={option.id} title={option.label}>
                    {progressFilterChipLabel(option)}
                  </option>
                ))}
              {visibleMissingProgressOptions.length > 0 ? (
                <optgroup label="Missing progress">
                  {visibleMissingProgressOptions.map((option) => (
                    <option key={option.id} value={option.id} title={option.label}>
                      {progressFilterChipLabel(option)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </div>
          <div className="w-full sm:min-w-[160px] sm:flex-1">
            <label htmlFor="leads-call-outcome-filter" className={labelClass}>
              Call outcome
            </label>
            <select
              id="leads-call-outcome-filter"
              value={leadContactTagFilter}
              onChange={(e) => {
                setLeadContactTagFilter(e.target.value);
                setPage(1);
              }}
              className={inputClass}
              aria-label="Filter by call outcome"
            >
              {contactFilterOptions.map((option) => (
                <option key={option.id} value={option.id} title={option.label}>
                  {contactFilterChipLabel(option)}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:min-w-[160px] sm:flex-1">
            <label htmlFor="leads-state-filter" className={labelClass}>
              State
            </label>
            <select
              id="leads-state-filter"
              value={stateFilter}
              onChange={(e) => {
                setStateFilter(e.target.value);
                setPage(1);
              }}
              className={inputClass}
              aria-label="Filter by state"
            >
              <option value="all">All states</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Search
          </button>
        </form>

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            void onApplyRange(e);
          }}
        >
          <div>
            <label className={labelClass}>Date range (optional)</label>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: "all", label: "All time" },
                { id: "today", label: "Today" },
                { id: "yesterday", label: "Yesterday" },
                { id: "week", label: "Last 7 days" },
                { id: "month", label: "This month" },
                { id: "custom", label: "Custom" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyRangePreset(p.id)}
                  className={`h-9 rounded-lg border px-3 text-sm font-semibold ${
                    rangePreset === p.id
                      ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              {rangePreset === "custom" ? (
                <>
                  <input
                    id="leads-from-date"
                    type="date"
                    aria-label="From date"
                    title="From date"
                    className="h-9 w-[9.5rem] rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                    value={rangeFrom}
                    onChange={(e) => {
                      setRangePreset("custom");
                      setRangeFrom(e.target.value);
                    }}
                  />
                  <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">to</span>
                  <input
                    id="leads-to-date"
                    type="date"
                    aria-label="To date"
                    title="To date"
                    className="h-9 w-[9.5rem] rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                    value={rangeTo}
                    onChange={(e) => {
                      setRangePreset("custom");
                      setRangeTo(e.target.value);
                    }}
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Apply
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {appliedFrom && appliedTo ? (
              <>
                Showing{" "}
                <span className="font-medium">
                  {[
                    workflowFilterDisplayLabel(phaseFilterOptions, leadPhaseFilter, preferShortLabels),
                    leadProgressTagFilter !== "all"
                      ? workflowFilterLabel(progressFilterOptions, leadProgressTagFilter)
                      : null,
                    leadContactTagFilter !== "all"
                      ? workflowFilterLabel(contactFilterOptions, leadContactTagFilter)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>{" "}
                {dateRangeHint(leadPhaseFilter, sortBy)}{" "}
                <span className="font-medium">
                  {appliedFrom} — {appliedTo}
                </span>
              </>
            ) : (
              <>
                Showing{" "}
                <span className="font-medium">
                  {[
                    workflowFilterDisplayLabel(phaseFilterOptions, leadPhaseFilter, preferShortLabels),
                    leadProgressTagFilter !== "all"
                      ? workflowFilterLabel(progressFilterOptions, leadProgressTagFilter)
                      : null,
                    leadContactTagFilter !== "all"
                      ? workflowFilterLabel(contactFilterOptions, leadContactTagFilter)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>{" "}
                across all dates.
              </>
            )}
          </p>
        </form>

        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {showLeadFilters && showSupervisorFilter ? (
              <div>
                <label className={labelClass}>Filter by supervisor</label>
                <select
                  value={supervisorFilter}
                  onChange={(e) => onSupervisorFilterChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="all">All supervisors</option>
                  {filterSupervisors.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.username}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {showLeadFilters ? (
              <div>
                <label className={labelClass}>
                  {showSupervisorFilter ? "Filter by agent / supervisor" : "Filter by agent"}
                </label>
                <select
                  value={agentFilter}
                  onChange={(e) => {
                    setAgentFilter(e.target.value);
                    setPage(1);
                  }}
                  className={inputClass}
                >
                  <option value="all">
                    {showSupervisorFilter ? "All agents & supervisors" : "All agents"}
                  </option>
                  {filteredAgents.map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {creatorFilterLabel(a)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {isSupervisor ? (
              <div>
                <label className={labelClass}>Assignment</label>
                <select
                  value={assignedScopeFilter}
                  onChange={(e) => {
                    const next = e.target.value;
                    setAssignedScopeFilter(next);
                    if (next !== "all") setAgentFilter("all");
                    setPage(1);
                  }}
                  className={inputClass}
                >
                  <option value="all">All my leads</option>
                  <option value="other_team">Assigned (other team)</option>
                </select>
              </div>
            ) : null}
            {showSupervisorFilter && supervisorFilter !== "all" ? (
              <div>
                <label className={labelClass}>Assignment</label>
                <select
                  value={assignedScopeFilter}
                  onChange={(e) => {
                    const next = e.target.value;
                    setAssignedScopeFilter(next);
                    if (next !== "all") setAgentFilter("all");
                    setPage(1);
                  }}
                  className={inputClass}
                >
                  <option value="all">Team + assigned</option>
                  <option value="other_team">Assigned (other team)</option>
                </select>
              </div>
            ) : null}
            <div className="sm:col-span-2 lg:col-span-3">
              <span className={labelClass}>Sort by</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Sort leads">
                {[
                  { id: "createdAt", label: "Created" },
                  { id: "updatedAt", label: "Updated" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setSortBy(option.id);
                      setPage(1);
                    }}
                    className={`h-11 rounded-xl border px-4 text-sm font-semibold ${
                      sortBy === option.id
                        ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                    aria-pressed={sortBy === option.id}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
                    setPage(1);
                  }}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
                    sortDir === "asc"
                      ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                  aria-pressed={sortDir === "asc"}
                  aria-label={sortDir === "asc" ? "Sorting ascending (oldest first)" : "Sorting descending (newest first)"}
                  title={sortDir === "asc" ? "Ascending (oldest first)" : "Descending (newest first)"}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    {sortDir === "asc" ? (
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    ) : (
                      <path d="M12 5v14M19 12l-7 7-7-7" />
                    )}
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {loading
            ? "Loading leads…"
            : refreshing
              ? "Refreshing…"
              : pagination.total > 0
                ? `Showing ${leads.length} of ${pagination.total} leads`
                : "No leads to show"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || refreshing}
            className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-zinc-800"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={onPrevPage}
            disabled={!pagination.hasPrev || loading || refreshing}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Prev
          </button>
          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Page {pagination.page} / {pagination.totalPages}
          </span>
          <button
            type="button"
            onClick={onNextPage}
            disabled={!pagination.hasNext || loading || refreshing}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Next
          </button>
        </div>
      </div>

      {isProcessor ? (
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Processor lead views">
          {[
            { id: "own", label: "My leads" },
            { id: "assigned", label: "Assigned for processing" },
            { id: "all", label: "All" },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setProcessorScopeFilter(option.id);
                setPage(1);
              }}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                processorScopeFilter === option.id
                  ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
              aria-pressed={processorScopeFilter === option.id}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <WorkflowStatusLegend workflowTags={workflowTags} preferShortLabels={preferShortLabels} />

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <table className="w-full min-w-[760px] table-fixed text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-400">
            <tr>
              <th className={`${tableHeadClass} min-w-[120px] max-w-[140px] px-3`}>Name</th>
              <th className={tableHeadClass}>Phone</th>
              <th className={`${tableHeadClass} max-w-[110px]`}>Service</th>
              <th className={`${tableHeadClass} max-w-[140px]`}>Status</th>
              <th className={`${tableHeadClass} max-w-[100px]`}>Location</th>
              {showAgentColumn ? <th className={`${tableHeadClass} max-w-[56px]`}>Agent</th> : null}
              <th className={`${tableHeadClass} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-8 text-center text-zinc-500">
                  {hasActiveLeadFilters({
                    supervisorFilter,
                    agentFilter,
                    assignedScopeFilter,
                    processorScopeFilter,
                    leadPhaseFilter,
                    leadProgressTagFilter,
                    leadContactTagFilter,
                    stateFilter,
                    rangePreset,
                    q,
                  })
                    ? "No leads match the selected filters."
                    : "No leads yet. Add your first lead above."}
                </td>
              </tr>
            ) : (
              leads.map((lead) => {
                const serviceLabel = formatLeadService(lead);
                const locationLabel = formatLeadLocation(lead);
                return (
                <tr
                  key={lead.id}
                  className={`text-zinc-800 dark:text-zinc-200 ${
                    selectedLeadId === lead.id ? "bg-emerald-50/60 dark:bg-emerald-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                  }`}
                >
                  <td
                    className={`${tableCellClass} max-w-[140px] truncate font-medium`}
                    title={formatLeadName(lead) !== "—" ? formatLeadName(lead) : undefined}
                  >
                    {formatLeadName(lead)}
                  </td>
                  <td className={`${tableCellClass} whitespace-nowrap font-mono`}>
                    <span className="inline-flex items-center gap-1">
                      {!phonesRedacted && !lead.phonesRedacted ? (
                        <CopyPhoneButton phone={lead.phone} className="h-6 w-6" />
                      ) : null}
                      <span>{formatLeadPhoneDisplay(lead.phone, phonesRedacted || lead.phonesRedacted)}</span>
                    </span>
                  </td>
                  <td
                    className={`${tableCellClass} max-w-[110px] truncate font-bold text-zinc-800 dark:text-zinc-100`}
                    title={serviceLabel !== "—" ? serviceLabel : undefined}
                  >
                    {serviceLabel}
                  </td>
                  <td className={`${tableCellClass} max-w-[140px] overflow-hidden`}>
                    <StatusPill lead={lead} workflowTagLookup={workflowTagLookup} preferShortLabels={preferShortLabels} />
                  </td>
                  <td
                    className={`${tableCellClass} max-w-[100px] truncate text-zinc-600 dark:text-zinc-400`}
                    title={locationLabel !== "—" ? locationLabel : undefined}
                  >
                    {locationLabel}
                  </td>
                  {showAgentColumn ? (
                    <td
                      className={`${tableCellClass} max-w-[56px] truncate font-medium text-zinc-700 dark:text-zinc-300`}
                      title={lead.createdByUsername || undefined}
                    >
                      {lead.createdByUsername || "—"}
                    </td>
                  ) : null}
                  <td className={`${tableCellClass} whitespace-nowrap text-right`}>
                    <div className="flex justify-end gap-1">
                      <IconTooltipButton title="Edit" onClick={() => setEditingLeadId(lead.id)}>
                        <EditIcon />
                      </IconTooltipButton>
                      <IconTooltipButton title="View" onClick={() => setSelectedLeadId(lead.id)}>
                        <ViewIcon />
                      </IconTooltipButton>
                      <Link
                        href={`/leads/${lead.id}`}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        title="Open full page"
                        aria-label="Open full page"
                      >
                        <ExpandIcon className="h-4 w-4" />
                      </Link>
                      {!phonesRedacted ? (
                        <IconTooltipButton
                          title={callingId === lead.id ? "Calling…" : "Call"}
                          variant="primary"
                          disabled={
                            Boolean(session) ||
                            callingId === lead.id ||
                            !canStartCall ||
                            lead.status === "dnc" || lead.leadPhase === "cancelled"
                          }
                          onClick={() => void onCallLead(lead)}
                        >
                          <CallIcon />
                        </IconTooltipButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedLead ? (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={() => setSelectedLeadId(null)}
          onLeadUpdated={handleLeadUpdated}
          onEdit={() => setEditingLeadId(selectedLead.id)}
          onCallLead={phonesRedacted ? undefined : onCallLead}
          phonesRedacted={phonesRedacted || selectedLead.phonesRedacted}
          calling={callingId === selectedLead.id}
          canCall={canStartCall}
          hasActiveCall={Boolean(session)}
          workflowTagLookup={workflowTagLookup}
          preferShortLabels={preferShortLabels}
          canAssignLead={isAdmin}
        />
      ) : null}

      {editingLead ? (
        <LeadEditModal
          lead={editingLead}
          phonesRedacted={phonesRedacted || editingLead.phonesRedacted}
          onClose={() => setEditingLeadId(null)}
          onSaved={(updated) => {
            handleLeadUpdated(updated);
            setEditingLeadId(null);
          }}
        />
      ) : null}
        </>
      ) : null}
    </div>
  );
}
