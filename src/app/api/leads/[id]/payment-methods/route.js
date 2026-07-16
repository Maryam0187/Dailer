import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { canAccessLead } from "@/server/leads/leadAccess";
import { canViewLeadPaymentChargeInfo } from "@/lib/leadRoles";
import {
  serializePaymentMethodForLeadViewer,
  serializePaymentMethodsForLeadViewer,
} from "@/server/customers/serializePaymentMethodForLeadViewer";
import {
  parsePaymentBody,
  clearUnusedPaymentFields,
} from "@/server/customers/parsePaymentBody";
import { syncLeadCustomer } from "@/server/customers/syncCustomer";
import { formatPaymentLinkActivity, normalizeLeadPaymentChargeAmount, normalizeLeadPaymentMethod } from "@/lib/leadWorkflow";
import { createLeadUpdate } from "@/server/leads/leadUpdates";
import { logLeadUpdateActivity } from "@/server/activity/logLeadActivity";
import { leadListIncludes, serializeLead } from "@/server/leads/serializeLead";

async function clearOtherDefaults(customerId, exceptId, transaction) {
  const where = { customerId, isDefault: true };
  if (exceptId) where.id = { [Op.ne]: exceptId };
  await db.CustomerPaymentMethod.update(
    { isDefault: false },
    { where, transaction },
  );
}

async function loadLeadForPaymentAccess(id) {
  return db.Lead.findByPk(id, {
    attributes: [
      "id",
      "phone",
      "fullName",
      "city",
      "state",
      "zipCode",
      "serviceType",
      "cableName",
      "streamName",
      "customerId",
      "customerPaymentMethodId",
      "leadPaymentMethod",
      "leadPaymentChargeStatus",
      "leadPaymentDeclineReason",
      "leadPaymentProcessor",
      "leadPaymentChargeAmount",
      "leadPhase",
      "assignedUserId",
      "createdByUserId",
      "processorUserId",
    ],
  });
}

/** List payment methods for the lead's customer (role-aware masking). */
export async function GET(_req, { params }) {
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const lead = await loadLeadForPaymentAccess(id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!(await canAccessLead(lead, authedUser))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!lead.customerId) {
    return NextResponse.json({
      customerId: null,
      linkedPaymentMethodId: null,
      paymentMethods: [],
      canEditPaymentMethods: canViewLeadPaymentChargeInfo(authedUser.role),
    });
  }

  const rows = await db.CustomerPaymentMethod.findAll({
    where: { customerId: lead.customerId },
    order: [
      ["isDefault", "DESC"],
      ["createdAt", "DESC"],
    ],
    include: [
      {
        model: db.User,
        as: "createdBy",
        attributes: ["id", "username", "role"],
        required: false,
      },
    ],
  });

  return NextResponse.json({
    customerId: lead.customerId,
    linkedPaymentMethodId: lead.customerPaymentMethodId ?? null,
    canEditPaymentMethods: canViewLeadPaymentChargeInfo(authedUser.role),
    paymentMethods: serializePaymentMethodsForLeadViewer(rows, {
      viewerRole: authedUser.role,
      leadPhase: lead.leadPhase || "active",
    }),
  });
}

/**
 * Create a payment method on the lead's customer and auto-link it to this lead.
 * Agents/supervisors may add; edit remains admin-only (customer payment-methods PATCH).
 */
export async function POST(req, { params }) {
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const lead = await loadLeadForPaymentAccess(id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!(await canAccessLead(lead, authedUser))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!lead.phone) {
    return NextResponse.json(
      { error: "Lead needs a phone number before payment can be saved" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  const { data, errors } = parsePaymentBody(body, { partial: false });
  if (errors.length) {
    return NextResponse.json({ error: errors[0] }, { status: 400 });
  }

  const cleaned = clearUnusedPaymentFields(data.type, data);
  const previousPmId = lead.customerPaymentMethodId;

  let chargeAmount;
  if (body?.leadPaymentChargeAmount !== undefined || body?.chargeAmount !== undefined) {
    chargeAmount = normalizeLeadPaymentChargeAmount(
      body.leadPaymentChargeAmount !== undefined ? body.leadPaymentChargeAmount : body.chargeAmount,
    );
    if (chargeAmount === undefined) {
      return NextResponse.json({ error: "Invalid charge amount" }, { status: 400 });
    }
  }

  const row = await db.sequelize.transaction(async (transaction) => {
    let customerId = lead.customerId;
    if (customerId == null) {
      customerId = await syncLeadCustomer(lead, {}, { transaction });
    }
    if (customerId == null) {
      return null;
    }

    if (cleaned.isDefault) {
      await clearOtherDefaults(customerId, null, transaction);
    }

    const created = await db.CustomerPaymentMethod.create(
      {
        customerId,
        createdByUserId: authedUser.id,
        isDefault: Boolean(cleaned.isDefault),
        ...cleaned,
      },
      { transaction },
    );

    const methodType = normalizeLeadPaymentMethod(created.type) ?? created.type;
    const leadUpdate = {
      customerId,
      customerPaymentMethodId: created.id,
      leadPaymentMethod: methodType,
    };
    if (chargeAmount !== undefined) {
      leadUpdate.leadPaymentChargeAmount = chargeAmount;
    }
    if (previousPmId == null || Number(previousPmId) !== Number(created.id)) {
      leadUpdate.leadPaymentChargeStatus = null;
      leadUpdate.leadPaymentDeclineReason = null;
      leadUpdate.leadPaymentProcessor = null;
    }

    await lead.update(leadUpdate, { transaction });
    await db.Customer.update(
      { updatedAt: new Date() },
      { where: { id: customerId }, transaction },
    );

    return created;
  });

  if (!row) {
    return NextResponse.json(
      { error: "Lead needs a phone number before payment can be saved" },
      { status: 400 },
    );
  }

  if (previousPmId == null || Number(previousPmId) !== Number(row.id)) {
    const bodyText = formatPaymentLinkActivity(true, row.id);
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

  const withUser = await db.CustomerPaymentMethod.findByPk(row.id, {
    include: [
      {
        model: db.User,
        as: "createdBy",
        attributes: ["id", "username", "role"],
        required: false,
      },
    ],
  });

  const refreshed = await db.Lead.findByPk(lead.id, { include: leadListIncludes });

  return NextResponse.json(
    {
      paymentMethod: serializePaymentMethodForLeadViewer(withUser, {
        viewerRole: authedUser.role,
        leadPhase: refreshed?.leadPhase || lead.leadPhase || "active",
      }),
      lead: serializeLead(refreshed, null, authedUser.role),
      linkedPaymentMethodId: row.id,
    },
    { status: 201 },
  );
}
