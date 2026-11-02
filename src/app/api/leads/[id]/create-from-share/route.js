import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { canAccessLead } from "@/server/leads/leadAccess";
import { createLeadUpdate } from "@/server/leads/leadUpdates";
import { logLeadUserActivity } from "@/server/activity/logLeadActivity";
import { leadListIncludes, serializeLead } from "@/server/leads/serializeLead";
import { syncLeadCustomer } from "@/server/customers/syncCustomer";

function conflictResponse(createdLeadId) {
  return NextResponse.json(
    {
      error: "A lead was already created from this share",
      createdLeadId: createdLeadId ?? null,
    },
    { status: 409 },
  );
}

export async function POST(req, { params }) {
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const lead = await db.Lead.findByPk(id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!(await canAccessLead(lead, authedUser))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isShareUser = Number(lead.sharedViewerUserId) === Number(authedUser.id);
  if (authedUser.role !== "admin" && !isShareUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (lead.sharedViewerUserId == null) {
    return NextResponse.json({ error: "Lead is not shared" }, { status: 400 });
  }
  if (!lead.phone || !lead.fullName) {
    return NextResponse.json({ error: "Shared lead is missing a name or phone" }, { status: 400 });
  }

  const viewerId = lead.sharedViewerUserId;
  let createdId = null;

  try {
    const outcome = await db.sequelize.transaction(async (transaction) => {
      const locked = await db.Lead.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!locked || locked.sharedViewerUserId == null) {
        const err = new Error("Lead is not shared");
        err.status = 400;
        throw err;
      }

      const existing = await db.Lead.findOne({
        where: { createdFromLeadId: locked.id },
        attributes: ["id"],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (locked.sharedCreatedLeadId || existing) {
        const existingId = existing?.id || locked.sharedCreatedLeadId;
        if (existingId && locked.sharedCreatedLeadId !== existingId) {
          await locked.update(
            { sharedViewerStatus: "lead_created", sharedCreatedLeadId: existingId },
            { silent: true, transaction },
          );
        } else if (locked.sharedViewerStatus !== "lead_created") {
          await locked.update({ sharedViewerStatus: "lead_created" }, { silent: true, transaction });
        }
        return { conflict: true, createdLeadId: existingId };
      }

      const created = await db.Lead.create(
        {
          phone: locked.phone,
          fullName: locked.fullName,
          cellNumber: locked.cellNumber,
          company: locked.company,
          email: locked.email,
          city: locked.city,
          state: locked.state,
          zipCode: locked.zipCode,
          accountNumber: locked.accountNumber,
          serviceType: locked.serviceType,
          cableName: locked.cableName,
          streamName: locked.streamName,
          status: "new",
          source: "manual",
          leadPhase: "active",
          assignedUserId: locked.sharedViewerUserId,
          createdByUserId: authedUser.id,
          createdFromLeadId: locked.id,
          createdFromSharedViewerUserId: locked.sharedViewerUserId,
        },
        { transaction },
      );

      await syncLeadCustomer(created, {}, { transaction });
      await locked.update(
        { sharedViewerStatus: "lead_created", sharedCreatedLeadId: created.id },
        { silent: true, transaction },
      );
      return { conflict: false, createdId: created.id };
    });
    if (outcome.conflict) return conflictResponse(outcome.createdLeadId);
    createdId = outcome.createdId;
  } catch (err) {
    if (err?.status === 400) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err?.name === "SequelizeUniqueConstraintError") {
      const existing = await db.Lead.findOne({
        where: { createdFromLeadId: id },
        attributes: ["id"],
      });
      return conflictResponse(existing?.id ?? null);
    }
    throw err;
  }

  const created = await db.Lead.findByPk(createdId, { include: leadListIncludes });
  const sourceName = lead.fullName || `lead #${lead.id}`;
  const createdName = created?.fullName || `lead #${createdId}`;

  await createLeadUpdate({
    leadId: lead.id,
    userId: authedUser.id,
    type: "lead_edit",
    body: `Lead created from this shared lead (#${createdId})`,
  });
  await createLeadUpdate({
    leadId: createdId,
    userId: authedUser.id,
    type: "created",
    body: `Created from shared lead ${sourceName} (#${lead.id})`,
  });
  await logLeadUserActivity({
    req,
    userId: authedUser.id,
    action: "lead_created",
    leadId: createdId,
    metadata: {
      leadName: createdName,
      createdFromLeadId: lead.id,
      createdFromLeadName: sourceName,
      sharedViewerUserId: viewerId,
    },
  });

  await lead.reload({ include: leadListIncludes });
  return NextResponse.json(
    {
      ok: true,
      lead: serializeLead(lead, null, authedUser.role, authedUser.id),
      createdLead: created
        ? serializeLead(created, null, authedUser.role, authedUser.id)
        : null,
    },
    { status: 201 },
  );
}
