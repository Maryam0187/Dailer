export function serializeSoftwareLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone,
    fullName: row.fullName,
    email: row.email || null,
    company: row.company || null,
    city: row.city || null,
    state: row.state || null,
    zipCode: row.zipCode || null,
    notes: row.notes || null,
    status: row.status,
    leadPhase: row.leadPhase,
    leadContactTag: row.leadContactTag || null,
    leadAppointmentAt: row.leadAppointmentAt || null,
    leadAppointmentNote: row.leadAppointmentNote || null,
    assignedUserId: row.assignedUserId ?? null,
    assignedUsername: row.assignedUser?.username ?? null,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    campaign: "software",
    href: `/software-leads/${row.id}`,
  };
}

export const softwareLeadIncludes = [
  { association: "assignedUser", attributes: ["id", "username"], required: false },
];
