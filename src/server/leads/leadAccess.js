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
      where: { role: "agent", supervisorId: Number(authedUser.id), isActive: true },
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

/** Agents and supervisors shown in the leads page creator filter. */
export async function getLeadFilterCreators(authedUser) {
  if (hasFullLeadAccess(authedUser.role)) {
    const [agents, supervisors] = await Promise.all([
      db.User.findAll({
        where: { role: "agent", isActive: true },
        attributes: ["id", "username", "supervisorId"],
        order: [["username", "ASC"]],
      }),
      getFilterSupervisors(authedUser),
    ]);
    const supervisorNameById = new Map(supervisors.map((s) => [s.id, s.username]));
    const rows = supervisors.map((s) => ({
      id: s.id,
      username: s.username,
      role: "supervisor",
      supervisorId: null,
      supervisorName: null,
    }));
    for (const agent of agents) {
      rows.push({
        id: agent.id,
        username: agent.username,
        role: "agent",
        supervisorId: agent.supervisorId ?? null,
        supervisorName: agent.supervisorId ? supervisorNameById.get(agent.supervisorId) ?? null : null,
      });
    }
    return rows.sort((a, b) => {
      if (a.role !== b.role) return a.role === "supervisor" ? -1 : 1;
      return a.username.localeCompare(b.username);
    });
  }

  if (authedUser.role === "supervisor") {
    const [self, agents] = await Promise.all([
      db.User.findByPk(authedUser.id, { attributes: ["id", "username"] }),
      getAssignableAgents(authedUser),
    ]);
    const rows = [];
    if (self) {
      rows.push({
        id: self.id,
        username: self.username,
        role: "supervisor",
        supervisorId: null,
        supervisorName: null,
        isSelf: true,
      });
    }
    for (const agent of agents) {
      rows.push({
        id: agent.id,
        username: agent.username,
        role: "agent",
        supervisorId: agent.supervisorId ?? null,
        supervisorName: null,
        isSelf: false,
      });
    }
    return rows;
  }

  return [];
}

export async function canFilterLeadsByCreator(authedUser, userId) {
  if (!Number.isInteger(userId) || userId <= 0) return false;
  const creators = await getLeadFilterCreators(authedUser);
  return creators.some((c) => Number(c.id) === userId);
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
  const supervisorKey = Number(supervisorId);
  if (!Number.isInteger(supervisorKey) || supervisorKey <= 0) return [];
  const rows = await db.User.findAll({
    where: {
      role: "agent",
      supervisorId: supervisorKey,
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

function teamCreatorIds(supervisorUserId, agentIds) {
  return [Number(supervisorUserId), ...agentIds.map(Number)];
}

/** AND `extra` onto an existing Sequelize where clause. */
export function andWhereClause(baseWhere, extra) {
  if (!baseWhere || Object.keys(baseWhere).length === 0) return extra;
  return { [Op.and]: [baseWhere, extra] };
}

/**
 * Leads list filter — always by createdByUserId:
 * - no creator filter: whole team (supervisor + their agents) or all (admin)
 * - creator filter: only that person's created leads
 */
export async function resolveLeadsListWhere(authedUser, { creatorId = null, supervisorId = null } = {}) {
  const role = authedUser.role;

  if (role === "agent") {
    return {
      [Op.or]: [{ assignedUserId: authedUser.id }, { createdByUserId: authedUser.id }],
    };
  }

  if (role === "supervisor") {
    const agentIds = await getSupervisedAgentUserIds(authedUser.id);
    const teamIds = teamCreatorIds(authedUser.id, agentIds);
    if (creatorId) {
      if (!teamIds.includes(creatorId)) return null;
      return { createdByUserId: creatorId };
    }
    return { createdByUserId: { [Op.in]: teamIds } };
  }

  if (hasFullLeadAccess(role)) {
    if (supervisorId) {
      const agentIds = await getSupervisedAgentUserIds(supervisorId);
      const teamIds = teamCreatorIds(supervisorId, agentIds);
      if (creatorId) {
        if (!teamIds.includes(creatorId)) return null;
        return { createdByUserId: creatorId };
      }
      return { createdByUserId: { [Op.in]: teamIds } };
    }
    if (creatorId) {
      return { createdByUserId: creatorId };
    }
    return {};
  }

  return { createdByUserId: -1 };
}

export async function canAccessLead(lead, authedUser) {
  if (hasFullLeadAccess(authedUser.role)) {
    return true;
  }

  if (authedUser.role === "supervisor") {
    const agentIds = await getSupervisedAgentUserIds(authedUser.id);
    const teamIds = teamCreatorIds(authedUser.id, agentIds);
    return teamIds.includes(Number(lead.createdByUserId));
  }

  return lead.assignedUserId === authedUser.id || lead.createdByUserId === authedUser.id;
}
