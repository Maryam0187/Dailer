/** Roles that can open /users and observe team presence over Socket.IO. */
export function canAccessUsersPage(role) {
  return role === "admin" || role === "manager" || role === "supervisor";
}

export function isUsersPageObserver(role) {
  return canAccessUsersPage(role);
}

const MANAGER_TEAM_ROLES = ["agent", "supervisor", "processor", "lead_monitor"];

/** Whether the viewer may view or PATCH a target user (not self-only reads). */
export function assertCanManageTarget(authedUser, target) {
  if (authedUser.role === "admin") return true;
  if (authedUser.role === "manager") {
    return MANAGER_TEAM_ROLES.includes(target.role) && target.managerId === authedUser.id;
  }
  if (authedUser.role === "supervisor") {
    return target.role === "agent" && target.supervisorId === authedUser.id;
  }
  return false;
}

export function canViewTargetCalls(authedUser, target) {
  if (authedUser.role === "admin") return true;
  if (authedUser.role === "manager") {
    return MANAGER_TEAM_ROLES.includes(target.role) && target.managerId === authedUser.id;
  }
  if (authedUser.role === "supervisor") {
    return target.role === "agent" && target.supervisorId === authedUser.id;
  }
  return authedUser.id === target.id;
}
