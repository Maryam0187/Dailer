import { NextResponse } from "next/server";
import { Op } from "sequelize";
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

function parseAppointment(body) {
  const raw = body?.leadAppointmentAt;
  if (raw == null || String(raw).trim() === "") return { at: null, note: null };
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return { error: "Invalid appointment time" };
  return { at, note: trimField(body?.leadAppointmentNote, 65535) };
}

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseSoftwareLeads(authedUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 50));
  const q = String(searchParams.get("q") || "").trim();
  const accessWhere = softwareLeadListWhere(authedUser);
  let where = accessWhere;
  if (q) {
    const like = { [Op.like]: `%${q}%` };
    const searchWhere = {
      [Op.or]: [{ fullName: like }, { phone: like }, { company: like }, { email: like }],
    };
    where = authedUser.role === "admin" ? searchWhere : { [Op.and]: [accessWhere, searchWhere] };
  }

  const { rows, count } = await db.SoftwareLead.findAndCountAll({
    where,
    include: softwareLeadIncludes,
    order: [["createdAt", "DESC"]],
    offset: (page - 1) * pageSize,
    limit: pageSize,
    distinct: true,
  });

  return NextResponse.json({
    leads: rows.map(serializeSoftwareLead),
    pagination: {
      page,
      pageSize,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / pageSize)),
    },
  });
}

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseSoftwareLeads(authedUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const fullName = trimField(body?.fullName, 128);
  const phone = trimField(body?.phone, 32);
  if (!fullName || !phone) {
    return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
  }
  const appointment = parseAppointment(body);
  if (appointment.error) {
    return NextResponse.json({ error: appointment.error }, { status: 400 });
  }

  const lead = await db.SoftwareLead.create({
    fullName,
    phone,
    email: trimField(body?.email, 255),
    company: trimField(body?.company, 255),
    city: trimField(body?.city, 128),
    state: trimField(body?.state, 32),
    zipCode: trimField(body?.zipCode, 16),
    notes: trimField(body?.notes, 65535),
    assignedUserId: authedUser.id,
    createdByUserId: authedUser.id,
    leadContactTag: appointment.at ? "appointment" : null,
    leadAppointmentAt: appointment.at,
    leadAppointmentNote: appointment.at ? appointment.note : null,
  });

  const fresh = await db.SoftwareLead.findByPk(lead.id, { include: softwareLeadIncludes });
  return NextResponse.json({ lead: serializeSoftwareLead(fresh) }, { status: 201 });
}
