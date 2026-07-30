import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { serializeCustomerLead } from "@/server/customers/serializeCustomer";
import {
  formatPaymentAmountActivity,
  formatPaymentChargeActivity,
  formatPaymentLinkActivity,
  leadUpdateTypeForPaymentChargeStatus,
  normalizeLeadPaymentChargeAmount,
  normalizeLeadPaymentChargeStatus,
  normalizeLeadPaymentMethod,
} from "@/lib/leadWorkflow";
import { createLeadUpdate } from "@/server/leads/leadUpdates";
import { logLeadUpdateActivity } from "@/server/activity/logLeadActivity";
import { resolvePaymentProcessor } from "@/server/paymentProcessors/registry";
import { leadHasPaymentOutcome, removeLeadPaymentChargeHistory } from "@/server/customers/paymentOutcomeHistory";

function trimReason(value, maxLen = 2000) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function clearChargeOutcomeFields(update) {
  update.leadPaymentChargeStatus = null;
  update.leadPaymentDeclineReason = null;
  update.leadPaymentProcessor = null;
  update.leadPaymentOutcomeAt = null;
}

/**
 * Admin: link/unlink a saved payment method, set charge outcome, and/or charge amount.
 * Body:
 *   { customerPaymentMethodId?: number|null, leadPaymentMethod?: string|null,
 *     leadPaymentChargeStatus?: 'charged'|'declined'|'chargeback'|null,
 *     leadPaymentDeclineReason?: string|null,
 *     leadPaymentProcessor?: string,
 *     leadPaymentChargeAmount?: number|string|null }
 * Set leadPaymentChargeStatus to null to clear the latest outcome and remove charged/chargeback
 * history (admin undo for mistaken charges).
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
  const changingAmount = body.leadPaymentChargeAmount !== undefined;
  if (!linking && !charging && !changingAmount) {
    return NextResponse.json(
      {
        error:
          "customerPaymentMethodId, leadPaymentChargeStatus, or leadPaymentChargeAmount is required",
      },
      { status: 400 },
    );
  }

  const update = {};
  /** @type {{ type: string, body: string }[]} */
  const activities = [];

  if (linking) {
    const nextPmRaw = body.customerPaymentMethodId;
    const unlinking = nextPmRaw === null || nextPmRaw === "";
    const nextPmId = unlinking ? null : Number(nextPmRaw);
    const pmChanging =
      unlinking
        ? lead.customerPaymentMethodId != null
        : !Number.isInteger(nextPmId) || nextPmId <= 0
          ? true
          : nextPmId !== lead.customerPaymentMethodId;

    if (pmChanging) {
      const locked =
        lead.leadPaymentChargeStatus === "charged" ||
        lead.leadPaymentChargeStatus === "chargeback" ||
        (await leadHasPaymentOutcome(lead.id, "charged"));
      if (locked) {
        return NextResponse.json(
          { error: "Cannot change payment method after the sale was charged" },
          { status: 409 },
        );
      }
    }

    if (unlinking) {
      const previousPmId = lead.customerPaymentMethodId;
      update.customerPaymentMethodId = null;
      clearChargeOutcomeFields(update);
      if (body.leadPaymentMethod !== undefined) {
        const method = normalizeLeadPaymentMethod(body.leadPaymentMethod);
        if (method === undefined) {
          return NextResponse.json({ error: "Invalid payment method type" }, { status: 400 });
        }
        update.leadPaymentMethod = method;
      }
      if (previousPmId != null) {
        activities.push({
          type: "lead_phase_change",
          body: formatPaymentLinkActivity(false, previousPmId),
        });
      }
    } else {
      if (!Number.isInteger(nextPmId) || nextPmId <= 0) {
        return NextResponse.json({ error: "Invalid payment method id" }, { status: 400 });
      }
      const pm = await db.CustomerPaymentMethod.findOne({
        where: { id: nextPmId, customerId },
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

      update.customerPaymentMethodId = nextPmId;
      update.leadPaymentMethod = nextType;
      if (nextPmId !== lead.customerPaymentMethodId) {
        clearChargeOutcomeFields(update);
      }

      if (nextPmId !== lead.customerPaymentMethodId || nextType !== lead.leadPaymentMethod) {
        activities.push({
          type: "lead_phase_change",
          body: formatPaymentLinkActivity(true, nextPmId),
        });
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
      const removed = await removeLeadPaymentChargeHistory(lead.id);
      const hadOutcome =
        prevStatus != null ||
        lead.leadPaymentProcessor != null ||
        lead.leadPaymentDeclineReason != null ||
        lead.leadPaymentOutcomeAt != null ||
        removed > 0;
      if (hadOutcome) {
        clearChargeOutcomeFields(update);
        activities.push({
          type: "lead_phase_change",
          body: formatPaymentChargeActivity(null, null, linkedPmId, null),
        });
      }
    } else {
      let paymentMethodType = null;
      if (linkedPmId) {
        const linkedPm = await db.CustomerPaymentMethod.findByPk(linkedPmId, {
          attributes: ["type"],
        });
        paymentMethodType = linkedPm?.type || null;
      }
      if (!paymentMethodType) {
        paymentMethodType =
          update.leadPaymentMethod !== undefined
            ? update.leadPaymentMethod
            : lead.leadPaymentMethod;
      }
      const processorOptional = paymentMethodType === "check_mail";

      let resolved = null;
      if (body.leadPaymentProcessor) {
        resolved = await resolvePaymentProcessor(body.leadPaymentProcessor);
        if (!resolved) {
          return NextResponse.json({ error: "Invalid payment processor" }, { status: 400 });
        }
      } else if (!processorOptional) {
        return NextResponse.json({ error: "Payment processor is required" }, { status: 400 });
      }

      let declineReason = null;
      if (status === "declined") {
        // Declines only before charged; after charged, decline is locked.
        if (
          lead.leadPaymentChargeStatus === "charged" ||
          lead.leadPaymentChargeStatus === "chargeback" ||
          (await leadHasPaymentOutcome(lead.id, "charged"))
        ) {
          return NextResponse.json(
            { error: "Cannot decline after the sale was charged" },
            { status: 409 },
          );
        }
        // Each decline is a new event — require a reason on every request.
        const reason = trimReason(body.leadPaymentDeclineReason);
        if (!reason) {
          return NextResponse.json({ error: "Decline reason is required" }, { status: 400 });
        }
        declineReason = reason;
      } else if (status === "charged" || status === "chargeback") {
        // One charged and one chargeback per sale.
        if (await leadHasPaymentOutcome(lead.id, status)) {
          return NextResponse.json(
            {
              error:
                status === "charged"
                  ? "This sale was already charged"
                  : "This sale already has a chargeback",
            },
            { status: 409 },
          );
        }
      }

      let chargeAmount =
        lead.leadPaymentChargeAmount != null ? Number(lead.leadPaymentChargeAmount) : null;
      if (changingAmount) {
        const nextAmount = normalizeLeadPaymentChargeAmount(body.leadPaymentChargeAmount);
        if (nextAmount !== undefined) chargeAmount = nextAmount;
      }

      // Every submitted charge event is logged (declines/retries included).
      update.leadPaymentChargeStatus = status;
      update.leadPaymentDeclineReason = status === "declined" ? declineReason : null;
      update.leadPaymentProcessor = resolved?.code || null;
      update.leadPaymentOutcomeAt = new Date();
      activities.push({
        type: leadUpdateTypeForPaymentChargeStatus(status),
        body: formatPaymentChargeActivity(
          status,
          declineReason,
          linkedPmId,
          resolved?.shortCode || null,
          chargeAmount,
          resolved?.code || null,
        ),
      });
    }
  }

  if (changingAmount) {
    const amount = normalizeLeadPaymentChargeAmount(body.leadPaymentChargeAmount);
    if (amount === undefined) {
      return NextResponse.json({ error: "Invalid charge amount" }, { status: 400 });
    }
    const prevAmount =
      lead.leadPaymentChargeAmount != null ? Number(lead.leadPaymentChargeAmount) : null;
    if (prevAmount !== amount) {
      update.leadPaymentChargeAmount = amount;
      activities.push({
        type: "lead_phase_change",
        body: formatPaymentAmountActivity(amount),
      });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ lead: serializeCustomerLead(lead) });
  }

  await lead.update(update);
  // Keep customer list sort (updatedAt DESC) in sync with payment work on this customer.
  await db.Customer.update({ updatedAt: new Date() }, { where: { id: customerId } });

  for (const activity of activities) {
    const entry = await createLeadUpdate({
      leadId: lead.id,
      userId: authedUser.id,
      type: activity.type,
      body: activity.body,
    });
    await logLeadUpdateActivity({
      req,
      userId: authedUser.id,
      leadId: lead.id,
      leadName: lead.fullName,
      entry: entry || activity,
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
