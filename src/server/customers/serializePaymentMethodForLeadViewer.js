import { serializePaymentMethod } from "@/server/customers/serializeCustomer";
import {
  shouldHideLeadPaymentMethodFromViewer,
  shouldLockLeadPaymentSensitiveFields,
} from "@/lib/leadRoles";

function maskTail(value, keep = 4) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= keep) return digits;
  return `•••• ${digits.slice(-keep)}`;
}

function applySensitiveLock(base) {
  return {
    ...base,
    cardNumber: maskTail(base.cardNumber),
    cvv: base.cvv ? "•••" : null,
    accountNumber: maskTail(base.accountNumber),
    routingNumber: maskTail(base.routingNumber),
    sensitiveLocked: true,
  };
}

/** Serialize a payment method for lead viewers (full, last-4 locked, or null if hidden). */
export function serializePaymentMethodForLeadViewer(row, { viewerRole, leadPhase } = {}) {
  const creatorRole = row.createdBy?.role ?? null;
  if (shouldHideLeadPaymentMethodFromViewer(viewerRole, creatorRole)) {
    return null;
  }

  const base = {
    ...serializePaymentMethod(row),
    createdByRole: creatorRole,
  };

  const lockSensitive = shouldLockLeadPaymentSensitiveFields(
    viewerRole,
    leadPhase,
    creatorRole,
  );
  if (!lockSensitive) {
    return { ...base, sensitiveLocked: false };
  }

  return applySensitiveLock(base);
}

/** Map + drop methods hidden from this viewer. */
export function serializePaymentMethodsForLeadViewer(rows, options) {
  return (rows || [])
    .map((row) => serializePaymentMethodForLeadViewer(row, options))
    .filter(Boolean);
}
