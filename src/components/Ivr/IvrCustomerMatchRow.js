"use client";

import Link from "next/link";
import { useState } from "react";
import LeadDetailPanel from "@/components/Leads/LeadDetailPanel";
import IconTooltipButton, {
  CopyLinkIcon,
  ViewIcon,
} from "@/components/Leads/IconTooltipButton";

function customerSummary(customer) {
  if (!customer?.id) return null;
  const name = customer.fullName || `Customer #${customer.id}`;
  return customer.phone ? `${name} (${customer.phone})` : name;
}

/**
 * Customer / associate match line with deep-link + last-sale link icon + View sidebar.
 */
export default function IvrCustomerMatchRow({ label = "Customer", customer }) {
  const [lead, setLead] = useState(null);
  const [loadingLead, setLoadingLead] = useState(false);
  const [error, setError] = useState(null);

  if (!customer?.id) return null;

  const summary = customerSummary(customer);
  const lastSaleId = customer.lastSale?.id || null;
  const customerHref = `/customers?customerId=${customer.id}`;
  const saleHref = lastSaleId
    ? `/customers?customerId=${customer.id}&leadId=${lastSaleId}`
    : customerHref;

  async function openLastSaleSidebar() {
    if (!lastSaleId) {
      window.location.href = customerHref;
      return;
    }
    setLoadingLead(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${lastSaleId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load sale");
      setLead(json.lead || null);
    } catch (err) {
      setError(err?.message || "Failed to load sale");
      setLead(null);
    } finally {
      setLoadingLead(false);
    }
  }

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
        <span>
          {label}:{" "}
          <Link
            href={customerHref}
            className="font-medium text-sky-700 underline underline-offset-2 dark:text-sky-300"
          >
            {summary}
          </Link>
        </span>
        <Link
          href={saleHref}
          title={lastSaleId ? "Open last sale on Customers" : "Open customer on Customers"}
          aria-label={lastSaleId ? "Open last sale on Customers" : "Open customer on Customers"}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <CopyLinkIcon />
        </Link>
        <IconTooltipButton
          title={
            loadingLead
              ? "Loading sale…"
              : lastSaleId
                ? "View last sale"
                : "Open customer"
          }
          variant="accent"
          className="!h-6 !w-6"
          disabled={loadingLead}
          onClick={() => void openLastSaleSidebar()}
        >
          <ViewIcon />
        </IconTooltipButton>
        {error ? <span className="text-red-600 dark:text-red-400">{error}</span> : null}
      </div>
      {lead ? (
        <LeadDetailPanel
          lead={lead}
          onClose={() => setLead(null)}
          onLeadUpdated={(updated) =>
            setLead((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev))
          }
          showFullPageLink
          canAssignLead
          canEditChargeAmount
        />
      ) : null}
    </>
  );
}
