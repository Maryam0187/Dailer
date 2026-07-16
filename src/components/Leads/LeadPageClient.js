"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { startOutgoingCall } from "@/lib/startOutgoingCall";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";
import { formatLeadPhoneDisplay, shouldRedactLeadPhones } from "@/lib/maskPhone";
import {
  ADMIN_SHORT_LABELS_STORAGE_KEY,
  buildWorkflowTagLookup,
  resolvePreferShortLabels,
} from "@/lib/workflowTagLabels";
import LeadDetailPanel from "@/components/Leads/LeadDetailPanel";
import LeadEditModal from "@/components/Leads/LeadEditModal";

function formatLeadName(lead) {
  return lead?.fullName?.trim() || "—";
}

export default function LeadPageClient({ leadId, userRole }) {
  const { session, beginSession } = useActiveCall();
  const {
    ensureRegistered,
    registered,
    sdkInitializing,
    voiceDisplaced,
    isPrimaryTab,
    expectOutgoingIncomingLeg,
  } = useTwilioVoice();

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [callingId, setCallingId] = useState(null);
  const [editing, setEditing] = useState(false);
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
  const isAdmin = userRole === "admin";
  const preferShortLabels = resolvePreferShortLabels(isAdmin, adminShortLabels);
  const phonesRedacted = shouldRedactLeadPhones(userRole);
  const canStartCall = isPrimaryTab !== false && (registered || voiceDisplaced) && !sdkInitializing;

  const loadLead = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}`, { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load lead");
      setLead(json.lead || null);
    } catch (e) {
      setLead(null);
      setError(e.message || "Failed to load lead");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void loadLead();
  }, [loadLead]);

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
    if (!isAdmin) return undefined;
    function onStorage(e) {
      if (e.key === ADMIN_SHORT_LABELS_STORAGE_KEY) {
        setAdminShortLabels(e.newValue === "true");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isAdmin]);

  async function onCallLead(target) {
    if (phonesRedacted || session || target.status === "dnc" || target.leadPhase === "cancelled") return;
    setCallingId(target.id);
    setError(null);
    try {
      expectOutgoingIncomingLeg(45000);
      if (!registered || sdkInitializing) await ensureRegistered();

      const result = await startOutgoingCall({ leadId: target.id });
      if (!result.ok) throw new Error(result.error);

      beginSession({
        callId: result.call.id,
        callOwnedByMe: true,
        callMode: result.callMode || "direct",
        callKind: "lead",
        dialMode: "agent_first",
        toNumber: result.call.toNumber,
        phoneLabel: formatLeadPhoneDisplay(target.phone, phonesRedacted || target.phonesRedacted),
        customerName: formatLeadName(target),
        leadId: target.id,
      });
    } catch (e) {
      setError(e.message || "Call failed");
    } finally {
      setCallingId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
        Loading lead…
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-8 text-center dark:border-red-900 dark:bg-red-950/30">
        <p className="text-sm font-medium text-red-800 dark:text-red-200">{error || "Lead not found"}</p>
        <Link
          href="/leads"
          className="mt-4 inline-flex rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Back to leads
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}
      <LeadDetailPanel
        lead={lead}
        variant="page"
        onLeadUpdated={(updated) => setLead((prev) => ({ ...prev, ...updated }))}
        onEdit={() => setEditing(true)}
        onCallLead={phonesRedacted ? undefined : onCallLead}
        phonesRedacted={phonesRedacted || lead.phonesRedacted}
        calling={callingId === lead.id}
        canCall={canStartCall}
        hasActiveCall={Boolean(session)}
        workflowTagLookup={workflowTagLookup}
        preferShortLabels={preferShortLabels}
        canAssignLead={isAdmin}
        canEditChargeAmount={isAdmin}
      />
      {editing ? (
        <LeadEditModal
          lead={lead}
          phonesRedacted={phonesRedacted || lead.phonesRedacted}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setLead((prev) => ({ ...prev, ...updated }));
            setEditing(false);
          }}
        />
      ) : null}
    </div>
  );
}
