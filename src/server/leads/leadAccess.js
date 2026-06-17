import { Op } from "sequelize";
import db from "@/server/db";

/** Active agents a user may assign leads to. */
export async function getAssignableAgents(authedUser) {
  if (authedUser.role === "admin" || authedUser.role === "manager") {
    return db.User.findAll({
      where: { role: "agent", isActive: true },
      attributes: ["id", "username", "supervisorId"],
      order: [["username", "ASC"]],
    });
  }
  if (authedUser.role === "supervisor") {
    return db.User.findAll({
      where: { role: "agent", supervisorId: authedUser.id, isActive: true },
      attributes: ["id", "username", "supervisorId"],
      order: [["username", "ASC"]],
    });
  }
  return [];
}

/** Supervisors available in leads list filters (admin/manager). */
export async function getFilterSupervisors(authedUser) {
  if (authedUser.role === "admin" || authedUser.role === "manager") {
    return db.User.findAll({
      where: { role: "supervisor", isActive: true },
      attributes: ["id", "username"],
      order: [["username", "ASC"]],
    });
  }
  return [];
}

export async function canFilterLeadsBySupervisor(authedUser, supervisorId) {
  if (!Number.isInteger(supervisorId) || supervisorId <= 0) return false;
  if (authedUser.role !== "admin" && authedUser.role !== "manager") return false;
  const sup = await db.User.findOne({
    where: { id: supervisorId, role: "supervisor", isActive: true },
    attributes: ["id"],
  });
  return Boolean(sup);
}

export async function canAssignLeadToAgent(authedUser, agentUserId) {
  if (!Number.isInteger(agentUserId) || agentUserId <= 0) return false;
  const agents = await getAssignableAgents(authedUser);
  return agents.some((a) => a.id === agentUserId);
}

/** Active agents reporting to this supervisor. */
export async function getSupervisedAgentUserIds(supervisorId) {
  const rows = await db.User.findAll({
    where: {
      role: "agent",
      supervisorId,
      isActive: true,
    },
    attributes: ["id"],
    raw: true,
  });
  return rows.map((r) => r.id);
}

function leadBelongsToUsers(lead, userIds) {
  if (!userIds.length) return false;
  return userIds.includes(lead.assignedUserId) || userIds.includes(lead.createdByUserId);
}

/** Sequelize `where` for GET /api/leads list by role. */
export async function buildLeadsListWhere(authedUser) {
  const role = authedUser.role;

  if (role === "agent") {
    return {
      [Op.or]: [{ assignedUserId: authedUser.id }, { createdByUserId: authedUser.id }],
    };
  }

  if (role === "supervisor") {
    const agentIds = await getSupervisedAgentUserIds(authedUser.id);
    if (agentIds.length === 0) {
      return { id: -1 };
    }
    return {
      [Op.or]: [{ assignedUserId: { [Op.in]: agentIds } }, { createdByUserId: { [Op.in]: agentIds } }],
    };
  }

  // admin, manager — all leads
  return {};
}

export async function canAccessLead(lead, authedUser) {
  if (authedUser.role === "admin" || authedUser.role === "manager") {
    return true;
  }

  if (authedUser.role === "supervisor") {
    const agentIds = await getSupervisedAgentUserIds(authedUser.id);
    return leadBelongsToUsers(lead, agentIds);
  }

  return lead.assignedUserId === authedUser.id || lead.createdByUserId === authedUser.id;
}
