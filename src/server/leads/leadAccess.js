import { Op } from "sequelize";
import { hasFullLeadAccess } from "@/lib/leadRoles";
import db from "@/server/db";

function normalizeShiftFilter(value) {
  const s = String(value || "").trim().toLowerCase();
  if (s === "day" || s === "night") return s;
  return null; // combined / all
}

function normalizeUserShiftKey(value) {
  return value === "night" ? "night" : "day";
}

/** Admin may view all shifts; managers / lead_monitors are locked to their own. */
export function canViewAllLeadShifts(authedUser) {
  return authedUser?.role === "admin";
}

/** Own shift for non-admin full-access roles; null when no auto-scope applies. */
export function resolveOwnLeadShiftKey(authedUser) {
  if (!authedUser || canViewAllLeadShifts(authedUser)) return null;
  if (!hasFullLeadAccess(authedUser.role)) return null;
  return normalizeUserShiftKey(authedUser.shiftKey);
}

function userMatchesShift(userOrShiftKey, shiftKey) {
  if (!shiftKey) return true;
  const key =
    typeof userOrShiftKey === "string" || userOrShiftKey == null
      ? normalizeUserShiftKey(userOrShiftKey)
      : normalizeUserShiftKey(userOrShiftKey.shiftKey);
  return key === shiftKey;
}

/** Users that report to this manager (`managerId`). */
export async function getManagerTeamUsers(managerId) {
  const id = Number(managerId);
  if (!Number.isInteger(id) || id <= 0) return [];
  return db.User.findAll({
    where: { managerId: id },
    attributes: ["id", "username", "role", "supervisorId", "shiftKey", "isActive", "managerId"],
    order: [["username", "ASC"]],
  });
}

/** Creator ids a manager may see (team members + self). */
export async function getManagerTeamCreatorIds(managerId) {
  const team = await getManagerTeamUsers(managerId);
  const ids = team
    .map((u) => Number(u.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const selfId = Number(managerId);
  if (Number.isInteger(selfId) && selfId > 0 && !ids.includes(selfId)) {
    ids.push(selfId);
  }
  return ids;
}

/** User ids whose shift matches day or night (admins ignored as creators usually). */
export async function resolveUserIdsForShift(shiftKey) {
  const key = normalizeShiftFilter(shiftKey);
  if (!key) return null;

  const rows = await db.User.findAll({
    attributes: ["id", "shiftKey"],
    raw: true,
  });
  return rows
    .filter((u) => normalizeUserShiftKey(u.shiftKey) === key)
    .map((u) => Number(u.id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

/** Sequelize where fragment: leads created by users on this shift. */
export async function leadsCreatedByShiftWhere(shiftKey) {
  const key = normalizeShiftFilter(shiftKey);
  if (!key) return null;
  const ids = await resolveUserIdsForShift(key);
  if (!ids || ids.length === 0) return { createdByUserId: -1 };
  return { createdByUserId: { [Op.in]: ids } };
}

/** Active agents a user may assign leads to. */
export async function getAssignableAgents(authedUser) {
  const ownShift = resolveOwnLeadShiftKey(authedUser);

  if (authedUser.role === "manager") {
    const agents = await db.User.findAll({
      where: { role: "agent", isActive: true, managerId: Number(authedUser.id) },
      attributes: ["id", "username", "supervisorId", "shiftKey"],
      order: [["username", "ASC"]],
    });
    if (!ownShift) return agents;
    return agents.filter((a) => userMatchesShift(a, ownShift));
  }

  if (hasFullLeadAccess(authedUser.role)) {
    const agents = await db.User.findAll({
      where: { role: "agent", isActive: true },
      attributes: ["id", "username", "supervisorId", "shiftKey"],
      order: [["username", "ASC"]],
    });
    if (!ownShift) return agents;
    return agents.filter((a) => userMatchesShift(a, ownShift));
  }
  if (authedUser.role === "supervisor") {
    return db.User.findAll({
      where: { role: "agent", supervisorId: Number(authedUser.id), isActive: true },
      attributes: ["id", "username", "supervisorId", "shiftKey"],
      order: [["username", "ASC"]],
    });
  }
  return [];
}

/** Supervisors available in leads list filters (admin/manager). */
export async function getFilterSupervisors(authedUser) {
  const ownShift = resolveOwnLeadShiftKey(authedUser);

  if (authedUser.role === "manager") {
    const supervisors = await db.User.findAll({
      where: { role: "supervisor", isActive: true, managerId: Number(authedUser.id) },
      attributes: ["id", "username", "shiftKey"],
      order: [["username", "ASC"]],
    });
    if (!ownShift) return supervisors;
    return supervisors.filter((s) => userMatchesShift(s, ownShift));
  }

  if (hasFullLeadAccess(authedUser.role)) {
    const supervisors = await db.User.findAll({
      where: { role: "supervisor", isActive: true },
      attributes: ["id", "username", "shiftKey"],
      order: [["username", "ASC"]],
    });
    if (!ownShift) return supervisors;
    return supervisors.filter((s) => userMatchesShift(s, ownShift));
  }
  return [];
}

/** Agents and supervisors shown in the leads page creator filter. */
export async function getLeadFilterCreators(authedUser) {
  if (authedUser.role === "manager" || hasFullLeadAccess(authedUser.role)) {
    const ownShift = resolveOwnLeadShiftKey(authedUser);
    const agentWhere =
      authedUser.role === "manager"
        ? { role: "agent", isActive: true, managerId: Number(authedUser.id) }
        : { role: "agent", isActive: true };
    const [agents, supervisors] = await Promise.all([
      db.User.findAll({
        where: agentWhere,
        attributes: ["id", "username", "supervisorId", "shiftKey"],
        order: [["username", "ASC"]],
      }),
      getFilterSupervisors(authedUser),
    ]);
    const agentsForShift = ownShift
      ? agents.filter((a) => userMatchesShift(a, ownShift))
      : agents;
    const supervisorNameById = new Map(supervisors.map((s) => [s.id, s.username]));
    const rows = supervisors.map((s) => ({
      id: s.id,
      username: s.username,
      role: "supervisor",
      supervisorId: null,
      supervisorName: null,
      shiftKey: normalizeUserShiftKey(s.shiftKey),
    }));
    for (const agent of agentsForShift) {
      rows.push({
        id: agent.id,
        username: agent.username,
        role: "agent",
        supervisorId: agent.supervisorId ?? null,
        supervisorName: agent.supervisorId ? supervisorNameById.get(agent.supervisorId) ?? null : null,
        shiftKey: normalizeUserShiftKey(agent.shiftKey),
      });
    }
    return rows.sort((a, b) => {
      if (a.role !== b.role) return a.role === "supervisor" ? -1 : 1;
      return a.username.localeCompare(b.username);
    });
  }

  if (authedUser.role === "supervisor") {
    const [self, agents] = await Promise.all([
      db.User.findByPk(authedUser.id, { attributes: ["id", "username", "shiftKey"] }),
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
        shiftKey: self.shiftKey === "night" ? "night" : "day",
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
        shiftKey: agent.shiftKey === "night" ? "night" : "day",
      });
    }
    return rows;
  }

  return [];
}

/** All active users an admin may assign leads to. */
export async function getAdminAssignableUsers() {
  return db.User.findAll({
    where: { isActive: true },
    attributes: ["id", "username", "role", "supervisorId"],
    order: [
      ["role", "ASC"],
      ["username", "ASC"],
    ],
  });
}

/** Serialized assignable users for admin assignment UI. */
export async function getAdminAssignableUsersForAssignment() {
  const users = await getAdminAssignableUsers();
  const supervisorIds = [
    ...new Set(
      users
        .filter((u) => u.role === "agent" && u.supervisorId)
        .map((u) => Number(u.supervisorId)),
    ),
  ];
  const supervisors =
    supervisorIds.length > 0
      ? await db.User.findAll({
          where: { id: { [Op.in]: supervisorIds } },
          attributes: ["id", "username"],
        })
      : [];
  const supervisorNameById = new Map(supervisors.map((s) => [s.id, s.username]));
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    supervisorName: u.supervisorId ? supervisorNameById.get(Number(u.supervisorId)) ?? null : null,
  }));
}

export async function canFilterLeadsByCreator(authedUser, userId) {
  if (!Number.isInteger(userId) || userId <= 0) return false;
  const creators = await getLeadFilterCreators(authedUser);
  return creators.some((c) => Number(c.id) === userId);
}

/** Agents and supervisors shown in lead stats (created-by rows). */
export async function getLeadStatsCreators(authedUser) {
  if (authedUser.role === "manager") {
    const ownShift = resolveOwnLeadShiftKey(authedUser);
    const users = await db.User.findAll({
      where: {
        managerId: Number(authedUser.id),
        role: { [Op.in]: ["agent", "supervisor"] },
        isActive: true,
      },
      attributes: ["id", "username", "role", "shiftKey"],
      order: [
        ["role", "ASC"],
        ["username", "ASC"],
      ],
    });
    if (!ownShift) return users;
    return users.filter((u) => userMatchesShift(u, ownShift));
  }

  if (hasFullLeadAccess(authedUser.role)) {
    const ownShift = resolveOwnLeadShiftKey(authedUser);
    const users = await db.User.findAll({
      where: { role: { [Op.in]: ["agent", "supervisor"] }, isActive: true },
      attributes: ["id", "username", "role", "shiftKey"],
      order: [
        ["role", "ASC"],
        ["username", "ASC"],
      ],
    });
    if (!ownShift) return users;
    return users.filter((u) => userMatchesShift(u, ownShift));
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
  const ownShift = resolveOwnLeadShiftKey(authedUser);
  const where = { id: supervisorId, role: "supervisor", isActive: true };
  if (authedUser.role === "manager") {
    where.managerId = Number(authedUser.id);
  }
  const sup = await db.User.findOne({
    where,
    attributes: ["id", "shiftKey", "managerId"],
  });
  if (!sup) return false;
  return userMatchesShift(sup, ownShift);
}

export async function canAssignLeadToAgent(authedUser, agentUserId) {
  if (!Number.isInteger(agentUserId) || agentUserId <= 0) return false;
  if (authedUser.role === "admin") {
    const user = await db.User.findOne({
      where: { id: agentUserId, isActive: true },
      attributes: ["id"],
    });
    return Boolean(user);
  }
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

/** True when `where` is absent or `{}` — not when it only uses Symbol keys like Op.or. */
function isEmptyWhere(where) {
  if (!where || typeof where !== "object") return true;
  return Object.keys(where).length === 0 && Object.getOwnPropertySymbols(where).length === 0;
}

/** AND `extra` onto an existing Sequelize where clause. */
export function andWhereClause(baseWhere, extra) {
  if (isEmptyWhere(baseWhere)) return extra;
  return { [Op.and]: [baseWhere, extra] };
}

/**
 * Pending legacy imports (source=legacy_import, still owned by an admin) stay on
 * /import only — never in the main Leads list or lead stats.
 */
export async function excludePendingLegacyImportWhere() {
  const adminUsers = await db.User.findAll({
    where: { role: "admin" },
    attributes: ["id"],
    raw: true,
  });
  const adminIds = adminUsers.map((u) => Number(u.id)).filter((id) => Number.isInteger(id) && id > 0);
  if (adminIds.length === 0) {
    return { source: { [Op.ne]: "legacy_import" } };
  }
  return {
    [Op.or]: [
      { source: { [Op.ne]: "legacy_import" } },
      { createdByUserId: { [Op.notIn]: adminIds } },
    ],
  };
}

/**
 * Leads list filter — always by createdByUserId:
 * - no creator filter: whole team (supervisor + their agents) or all (admin)
 * - creator filter: only that person's created leads
 */
export async function resolveLeadsListWhere(
  authedUser,
  { creatorId = null, supervisorId = null, assignedScope = null, processorScope = null } = {},
) {
  const role = authedUser.role;
  const hidePendingImport = await excludePendingLegacyImportWhere();

  if (role === "agent") {
    return andWhereClause(
      {
        [Op.or]: [{ assignedUserId: authedUser.id }, { createdByUserId: authedUser.id }],
      },
      hidePendingImport,
    );
  }

  if (role === "processor") {
    if (processorScope === "assigned") {
      return andWhereClause({ processorUserId: authedUser.id }, hidePendingImport);
    }
    if (processorScope === "own") {
      return andWhereClause(
        {
          [Op.or]: [{ assignedUserId: authedUser.id }, { createdByUserId: authedUser.id }],
        },
        hidePendingImport,
      );
    }
    return andWhereClause(
      {
        [Op.or]: [
          { assignedUserId: authedUser.id },
          { createdByUserId: authedUser.id },
          { processorUserId: authedUser.id },
        ],
      },
      hidePendingImport,
    );
  }

  if (role === "supervisor") {
    if (assignedScope === "other_team") {
      const agentIds = await getSupervisedAgentUserIds(authedUser.id);
      const teamIds = teamCreatorIds(authedUser.id, agentIds);
      return andWhereClause(
        {
          assignedUserId: authedUser.id,
          createdByUserId: { [Op.notIn]: teamIds },
        },
        hidePendingImport,
      );
    }
    const visible = {
      [Op.or]: [{ createdByUserId: authedUser.id }, { assignedUserId: authedUser.id }],
    };
    if (creatorId) {
      return andWhereClause(andWhereClause({ createdByUserId: creatorId }, visible), hidePendingImport);
    }
    return andWhereClause(visible, hidePendingImport);
  }

  if (hasFullLeadAccess(role)) {
    const ownShift = resolveOwnLeadShiftKey(authedUser);
    const applyOwnShift = async (clause) => {
      if (!clause || !ownShift) return clause;
      const shiftWhere = await leadsCreatedByShiftWhere(ownShift);
      return andWhereClause(clause, shiftWhere);
    };

    const applyManagerTeam = async (clause) => {
      if (!clause || role !== "manager") return clause;
      const teamIds = await getManagerTeamCreatorIds(authedUser.id);
      if (teamIds.length === 0) {
        return andWhereClause(clause, { createdByUserId: -1 });
      }
      return andWhereClause(clause, { createdByUserId: { [Op.in]: teamIds } });
    };

    const applyManagerScopes = async (clause) => {
      const withTeam = await applyManagerTeam(clause);
      return applyOwnShift(withTeam);
    };

    if (supervisorId) {
      const agentIds = await getSupervisedAgentUserIds(supervisorId);
      const teamIds = teamCreatorIds(supervisorId, agentIds);
      if (assignedScope === "other_team") {
        return applyManagerScopes(
          andWhereClause(
            {
              assignedUserId: supervisorId,
              createdByUserId: { [Op.notIn]: teamIds },
            },
            hidePendingImport,
          ),
        );
      }
      if (creatorId) {
        if (!teamIds.includes(creatorId)) return null;
        return applyManagerScopes(andWhereClause({ createdByUserId: creatorId }, hidePendingImport));
      }
      return applyManagerScopes(
        andWhereClause(
          {
            [Op.or]: [{ createdByUserId: { [Op.in]: teamIds } }, { assignedUserId: supervisorId }],
          },
          hidePendingImport,
        ),
      );
    }
    if (creatorId) {
      return applyManagerScopes(andWhereClause({ createdByUserId: creatorId }, hidePendingImport));
    }
    return applyManagerScopes(hidePendingImport);
  }

  return { createdByUserId: -1 };
}

export async function canAccessLead(lead, authedUser) {
  if (hasFullLeadAccess(authedUser.role)) {
    if (canViewAllLeadShifts(authedUser)) return true;

    const creatorId = Number(lead.createdByUserId);
    if (!Number.isInteger(creatorId) || creatorId <= 0) return false;
    const creator = await db.User.findByPk(creatorId, {
      attributes: ["id", "shiftKey", "managerId"],
      raw: true,
    });
    if (!creator) return false;

    if (authedUser.role === "manager") {
      const onTeam =
        Number(creator.managerId) === Number(authedUser.id) ||
        Number(creator.id) === Number(authedUser.id);
      if (!onTeam) return false;
    }

    const ownShift = resolveOwnLeadShiftKey(authedUser);
    return userMatchesShift(creator, ownShift);
  }

  if (authedUser.role === "supervisor") {
    return lead.assignedUserId === authedUser.id || lead.createdByUserId === authedUser.id;
  }

  if (authedUser.role === "processor") {
    return (
      lead.assignedUserId === authedUser.id ||
      lead.createdByUserId === authedUser.id ||
      lead.processorUserId === authedUser.id
    );
  }

  return lead.assignedUserId === authedUser.id || lead.createdByUserId === authedUser.id;
}
