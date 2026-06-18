import { Op } from "sequelize";
import { hasFullLeadAccess } from "@/lib/leadRoles";
import db from "@/server/db";

/** Active agents a user may assign leads to. */
export async function getAssignableAgents(authedUser) {
  if (hasFullLeadAccess(authedUser.role)) {
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
  if (hasFullLeadAccess(authedUser.role)) {
    return db.User.findAll({
      where: { role: "supervisor", isActive: true },
      attributes: ["id", "username"],
      order: [["username", "ASC"]],
    });
  }
  return [];
}

/** Agents and supervisors shown in lead stats (created-by rows). */
export async function getLeadStatsCreators(authedUser) {
  if (hasFullLeadAccess(authedUser.role)) {
    return db.User.findAll({
      where: { role: { [Op.in]: ["agent", "supervisor"] }, isActive: true },
      attributes: ["id", "username", "role"],
      order: [
        ["role", "ASC"],
        ["username", "ASC"],
      ],
    });
  }

  if (authedUser.role === "supervisor") {
    const [self, agents] = await Promise.all([
      db.User.findByPk(authedUser.id, { attributes: ["id", "username", "role"] }),
      getAssignableAgents(authedUser),
    ]);
    const rows = [];
    if (self) rows.push(self);
    for (const agent of agents) {
      rows.push({ id: agent.id, username: agent.username, role: "agent" });
    }
    return rows;
  }

  if (authedUser.role === "agent") {
    const self = await db.User.findByPk(authedUser.id, { attributes: ["id", "username", "role"] });
    return self ? [self] : [];
  }

  return [];
}

export async function canFilterLeadsBySupervisor(authedUser, supervisorId) {
  if (!Number.isInteger(supervisorId) || supervisorId <= 0) return false;
  if (!hasFullLeadAccess(authedUser.role)) return false;
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

/** Supervisor + their agents (for team lead visibility). */
export async function getSupervisorTeamUserIds(supervisorId) {
  const agentIds = await getSupervisedAgentUserIds(supervisorId);
  return [...agentIds, supervisorId];
}

function leadBelongsToUsers(lead, userIds) {
  if (!userIds.length) return false;
  return userIds.includes(lead.assignedUserId) || userIds.includes(lead.createdByUserId);
}

function supervisorLeadOrConditions(supervisorUserId, agentIds) {
  const conditions = [
    { assignedUserId: supervisorUserId },
    { createdByUserId: supervisorUserId },
  ];
  if (agentIds.length > 0) {
    conditions.push(
      { assignedUserId: { [Op.in]: agentIds } },
      { createdByUserId: { [Op.in]: agentIds } },
    );
  }
  return conditions;
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
    return { [Op.or]: supervisorLeadOrConditions(authedUser.id, agentIds) };
  }

  // admin, manager, lead_monitor — all leads
  return {};
}

export async function canAccessLead(lead, authedUser) {
  if (hasFullLeadAccess(authedUser.role)) {
    return true;
  }

  if (authedUser.role === "supervisor") {
    if (lead.assignedUserId === authedUser.id || lead.createdByUserId === authedUser.id) {
      return true;
    }
    const agentIds = await getSupervisedAgentUserIds(authedUser.id);
    return leadBelongsToUsers(lead, agentIds);
  }

  return lead.assignedUserId === authedUser.id || lead.createdByUserId === authedUser.id;
}
