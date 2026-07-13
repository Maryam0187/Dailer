import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { serializeCustomerLead } from "@/server/customers/serializeCustomer";
import { normalizeLeadPaymentMethod, getLeadPaymentMethodMeta } from "@/lib/leadWorkflow";
import { createLeadUpdate } from "@/server/leads/leadUpdates";
import { logLeadUpdateActivity } from "@/server/activity/logLeadActivity";

/**
 * Admin: link (or clear) which saved payment method charged this lead.
 * Body: { customerPaymentMethodId: number|null, leadPaymentMethod?: string|null }
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
  if (!body || body.customerPaymentMethodId === undefined) {
    return NextResponse.json({ error: "customerPaymentMethodId is required" }, { status: 400 });
  }

  const update = {};
  const activityBodies = [];

  if (body.customerPaymentMethodId === null || body.customerPaymentMethodId === "") {
    update.customerPaymentMethodId = null;
    if (body.leadPaymentMethod !== undefined) {
      const method = normalizeLeadPaymentMethod(body.leadPaymentMethod);
      if (method === undefined) {
        return NextResponse.json({ error: "Invalid payment method type" }, { status: 400 });
      }
      update.leadPaymentMethod = method;
    }
    if (lead.customerPaymentMethodId != null) {
      activityBodies.push("Charged payment method cleared");
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

    if (pmId !== lead.customerPaymentMethodId || nextType !== lead.leadPaymentMethod) {
      const label = getLeadPaymentMethodMeta(nextType).label;
      activityBodies.push(`Charged with ${label} (#${pmId})`);
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ lead: serializeCustomerLead(lead) });
  }

  await lead.update(update);

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
