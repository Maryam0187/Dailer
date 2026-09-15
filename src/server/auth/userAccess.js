import { canHaveAssignedAgents, isLeadSupervisor } from "@/lib/leadRoles";

/** Roles that can open /users and observe team presence over Socket.IO. */
export function canAccessUsersPage(role) {
  return role === "admin" || role === "manager" || canHaveAssignedAgents(role);
}

export function isUsersPageObserver(role) {
  return canAccessUsersPage(role);
}

const MANAGER_TEAM_ROLES = ["agent", "supervisor", "processor", "lead_supervisor"];

function normalizeUserShiftKey(value) {
  return value === "night" ? "night" : "day";
}

function isLeadSupervisorManagedAgent(authedUser, target) {
  if (target.role !== "agent") return false;
  if (Number(target.supervisorId) !== Number(authedUser.id)) return false;
  if (Boolean(target.isOutside)) return false;
  return normalizeUserShiftKey(target.shiftKey) === normalizeUserShiftKey(authedUser.shiftKey);
}

/** Whether the viewer may view or PATCH a target user (not self-only reads). */
export function assertCanManageTarget(authedUser, target) {
  if (authedUser.role === "admin") return true;
  if (authedUser.role === "manager") {
    return MANAGER_TEAM_ROLES.includes(target.role) && target.managerId === authedUser.id;
  }
  if (isLeadSupervisor(authedUser.role)) {
    return isLeadSupervisorManagedAgent(authedUser, target);
  }
  if (canHaveAssignedAgents(authedUser.role)) {
    return target.role === "agent" && target.supervisorId === authedUser.id;
  }
  return false;
}

export function canViewTargetCalls(authedUser, target) {
  if (authedUser.role === "admin") return true;
  if (authedUser.role === "manager") {
    return MANAGER_TEAM_ROLES.includes(target.role) && target.managerId === authedUser.id;
  }
  if (isLeadSupervisor(authedUser.role)) {
    return isLeadSupervisorManagedAgent(authedUser, target);
  }
  if (canHaveAssignedAgents(authedUser.role)) {
    return target.role === "agent" && target.supervisorId === authedUser.id;
  }
  return authedUser.id === target.id;
}
