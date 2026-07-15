import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { serializeCustomerLead } from "@/server/customers/serializeCustomer";
import {
  formatPaymentChargeActivity,
  formatPaymentLinkActivity,
  normalizeLeadPaymentChargeStatus,
  normalizeLeadPaymentMethod,
} from "@/lib/leadWorkflow";
import { createLeadUpdate } from "@/server/leads/leadUpdates";
import { logLeadUpdateActivity } from "@/server/activity/logLeadActivity";
import { resolvePaymentProcessor } from "@/server/paymentProcessors/registry";

function trimReason(value, maxLen = 2000) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

/**
 * Admin: link/unlink a saved payment method, and/or set charge outcome.
 * Body:
 *   { customerPaymentMethodId?: number|null, leadPaymentMethod?: string|null,
 *     leadPaymentChargeStatus?: 'charged'|'declined'|'chargeback'|null,
 *     leadPaymentDeclineReason?: string|null,
 *     leadPaymentProcessor?: string }
 */
export async function PATCH(req, { params }) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawCustomerId, leadId: rawLeadId } = await params;
  const customerId = Number(rawCustomerId);
  const leadId = Number(rawLeadId);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "Invalid customer id" }, { status: 400 });
  }
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const lead = await db.Lead.findOne({ where: { id: leadId, customerId } });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found for this customer" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const linking = body.customerPaymentMethodId !== undefined;
  const charging = body.leadPaymentChargeStatus !== undefined;
  if (!linking && !charging) {
    return NextResponse.json(
      { error: "customerPaymentMethodId or leadPaymentChargeStatus is required" },
      { status: 400 },
    );
  }

  const update = {};
  const activityBodies = [];

  if (linking) {
    if (body.customerPaymentMethodId === null || body.customerPaymentMethodId === "") {
      const previousPmId = lead.customerPaymentMethodId;
      update.customerPaymentMethodId = null;
      update.leadPaymentChargeStatus = null;
      update.leadPaymentDeclineReason = null;
      update.leadPaymentProcessor = null;
      if (body.leadPaymentMethod !== undefined) {
        const method = normalizeLeadPaymentMethod(body.leadPaymentMethod);
        if (method === undefined) {
          return NextResponse.json({ error: "Invalid payment method type" }, { status: 400 });
        }
        update.leadPaymentMethod = method;
      }
      if (previousPmId != null) {
        activityBodies.push(formatPaymentLinkActivity(false, previousPmId));
      }
    } else {
      const pmId = Number(body.customerPaymentMethodId);
      if (!Number.isInteger(pmId) || pmId <= 0) {
        return NextResponse.json({ error: "Invalid payment method id" }, { status: 400 });
      }
      const pm = await db.CustomerPaymentMethod.findOne({
        where: { id: pmId, customerId },
      });
      if (!pm) {
        return NextResponse.json({ error: "Payment method not found for this customer" }, { status: 404 });
      }

      let nextType = pm.type;
      if (body.leadPaymentMethod !== undefined) {
        const method = normalizeLeadPaymentMethod(body.leadPaymentMethod);
        if (method === undefined) {
          return NextResponse.json({ error: "Invalid payment method type" }, { status: 400 });
        }
        if (method && method !== pm.type) {
          return NextResponse.json(
            { error: "Payment type does not match the selected payment method" },
            { status: 400 },
          );
        }
        nextType = method || pm.type;
      }

      update.customerPaymentMethodId = pmId;
      update.leadPaymentMethod = nextType;
      if (pmId !== lead.customerPaymentMethodId) {
        update.leadPaymentChargeStatus = null;
        update.leadPaymentDeclineReason = null;
        update.leadPaymentProcessor = null;
      }

      if (pmId !== lead.customerPaymentMethodId || nextType !== lead.leadPaymentMethod) {
        activityBodies.push(formatPaymentLinkActivity(true, pmId));
      }
    }
  }

  if (charging) {
    const status = normalizeLeadPaymentChargeStatus(body.leadPaymentChargeStatus);
    if (status === undefined) {
      return NextResponse.json({ error: "Invalid charge status" }, { status: 400 });
    }

    const linkedPmId =
      update.customerPaymentMethodId !== undefined
        ? update.customerPaymentMethodId
        : lead.customerPaymentMethodId;

    if (status && !linkedPmId) {
      return NextResponse.json(
        { error: "Link a payment method before setting charge status" },
        { status: 400 },
      );
    }

    const prevStatus = lead.leadPaymentChargeStatus || null;

    if (status === null) {
      if (prevStatus != null) {
        update.leadPaymentChargeStatus = null;
        update.leadPaymentDeclineReason = null;
        update.leadPaymentProcessor = null;
        activityBodies.push(formatPaymentChargeActivity(null, null, linkedPmId, null));
      }
    } else {
      const resolved = await resolvePaymentProcessor(body.leadPaymentProcessor);
      if (!resolved) {
        return NextResponse.json(
          {
            error: body.leadPaymentProcessor
              ? "Invalid payment processor"
              : "Payment processor is required",
          },
          { status: 400 },
        );
      }

      let declineReason = null;
      if (status === "declined") {
        // Each decline is a new event — require a reason on every request.
        const reason = trimReason(body.leadPaymentDeclineReason);
        if (!reason) {
          return NextResponse.json({ error: "Decline reason is required" }, { status: 400 });
        }
        declineReason = reason;
      }

      // Every submitted charge event is logged (declines/retries included).
      update.leadPaymentChargeStatus = status;
      update.leadPaymentDeclineReason = status === "declined" ? declineReason : null;
      update.leadPaymentProcessor = resolved.code;
      activityBodies.push(
        formatPaymentChargeActivity(status, declineReason, linkedPmId, resolved.shortCode),
      );
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ lead: serializeCustomerLead(lead) });
  }

  await lead.update(update);
  // Keep customer list sort (updatedAt DESC) in sync with payment work on this customer.
  await db.Customer.update({ updatedAt: new Date() }, { where: { id: customerId } });

  for (const bodyText of activityBodies) {
    const entry = await createLeadUpdate({
      leadId: lead.id,
      userId: authedUser.id,
      type: "lead_phase_change",
      body: bodyText,
    });
    await logLeadUpdateActivity({
      req,
      userId: authedUser.id,
      leadId: lead.id,
      leadName: lead.fullName,
      entry: entry || { type: "lead_phase_change", body: bodyText },
    });
  }

  const refreshed = await db.Lead.findByPk(lead.id, {
    include: [
      {
        model: db.User,
        as: "createdBy",
        attributes: ["id", "username"],
        required: false,
      },
      {
        model: db.User,
        as: "assignedUser",
        attributes: ["id", "username"],
        required: false,
      },
    ],
  });

  return NextResponse.json({ lead: serializeCustomerLead(refreshed) });
}
