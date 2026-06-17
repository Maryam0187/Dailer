export function canAccessLead(lead, authedUser) {
  if (authedUser.role === "admin" || authedUser.role === "manager" || authedUser.role === "supervisor") {
    return true;
  }
  return lead.assignedUserId === authedUser.id || lead.createdByUserId === authedUser.id;
}
