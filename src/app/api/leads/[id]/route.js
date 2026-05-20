import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { normalizeToE164 } from "@/server/calls/normalizePhone";

function trimField(value, maxLen) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function canAccessLead(lead, authedUser) {
  if (authedUser.role === "admin" || authedUser.role === "manager" || authedUser.role === "supervisor") {
    return true;
  }
  return lead.assignedUserId === authedUser.id || lead.createdByUserId === authedUser.id;
}

export async function PATCH(req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const lead = await db.Lead.findByPk(id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!canAccessLead(lead, authedUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const update = {};

  if (body?.phone != null) {
    const phone = normalizeToE164(body.phone);
    if (!phone) return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    update.phone = phone;
  }
  if (body?.firstName != null) {
    const firstName = trimField(body.firstName, 128);
    if (!firstName) return NextResponse.json({ error: "First name is required" }, { status: 400 });
    update.firstName = firstName;
  }
  if (body?.lastName !== undefined) update.lastName = trimField(body.lastName, 128);
  if (body?.company !== undefined) update.company = trimField(body.company, 255);
  if (body?.email !== undefined) update.email = trimField(body.email, 255);
  if (body?.city !== undefined) update.city = trimField(body.city, 128);
  if (body?.state !== undefined) update.state = trimField(body.state, 32);
  if (body?.zipCode !== undefined) update.zipCode = trimField(body.zipCode, 16);
  if (body?.notes !== undefined) update.notes = trimField(body.notes, 65535);

  const allowedStatuses = new Set(["new", "contacted", "callback", "qualified", "closed", "dnc"]);
  if (body?.status != null) {
    const status = String(body.status).trim().toLowerCase();
    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = status;
  }

  if (body?.nextCallbackAt !== undefined) {
    if (body.nextCallbackAt === null || body.nextCallbackAt === "") {
      update.nextCallbackAt = null;
    } else {
      const d = new Date(body.nextCallbackAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid nextCallbackAt" }, { status: 400 });
      }
      update.nextCallbackAt = d;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await lead.update(update);
  return NextResponse.json({ ok: true, lead });
}
