import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canUseSoftwareLeads, softwareLeadListWhere } from "@/server/softwareLeads/access";
import { serializeSoftwareLead, softwareLeadIncludes } from "@/server/softwareLeads/serialize";

function trimField(value, max) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

async function loadLead(user, id) {
  return db.SoftwareLead.findOne({
    where: { id, ...softwareLeadListWhere(user) },
    include: softwareLeadIncludes,
  });
}

export async function GET(_req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseSoftwareLeads(authedUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const lead = await loadLead(authedUser, id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lead: serializeSoftwareLead(lead) });
}

export async function PATCH(req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseSoftwareLeads(authedUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const lead = await loadLead(authedUser, id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const updates = {};
  if (body?.fullName !== undefined) {
    const fullName = trimField(body.fullName, 128);
    if (!fullName) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    updates.fullName = fullName;
  }
  if (body?.phone !== undefined) {
    const phone = trimField(body.phone, 32);
    if (!phone) return NextResponse.json({ error: "Phone is required" }, { status: 400 });
    updates.phone = phone;
  }
  if (body?.email !== undefined) updates.email = trimField(body.email, 255);
  if (body?.company !== undefined) updates.company = trimField(body.company, 255);
  if (body?.notes !== undefined) updates.notes = trimField(body.notes, 65535);
  if (body?.leadAppointmentAt !== undefined) {
    const raw = body.leadAppointmentAt;
    if (raw == null || String(raw).trim() === "") {
      updates.leadAppointmentAt = null;
      updates.leadAppointmentNote = null;
      updates.leadContactTag = null;
    } else {
      const at = new Date(raw);
      if (Number.isNaN(at.getTime())) {
        return NextResponse.json({ error: "Invalid appointment time" }, { status: 400 });
      }
      updates.leadAppointmentAt = at;
      updates.leadAppointmentNote = trimField(body?.leadAppointmentNote, 65535);
      updates.leadContactTag = "appointment";
    }
  } else if (body?.leadAppointmentNote !== undefined && lead.leadAppointmentAt) {
    updates.leadAppointmentNote = trimField(body.leadAppointmentNote, 65535);
  }

  if (Object.keys(updates).length) await lead.update(updates);
  const fresh = await loadLead(authedUser, id);
  return NextResponse.json({ lead: serializeSoftwareLead(fresh) });
}
