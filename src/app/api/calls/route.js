import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

function parseBool(value) {
  if (value === undefined) return false;
  return value === "true" || value === "1";
}

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "mine";
  const agentIdRaw = url.searchParams.get("agentId");
  const managerIdRaw = url.searchParams.get("managerId");
  const includeManagerCalls = parseBool(url.searchParams.get("includeManagerCalls"));

  const agentId = agentIdRaw ? Number(agentIdRaw) : null;
  const managerId = managerIdRaw ? Number(managerIdRaw) : null;

  // Allowed views by role.
  const role = authedUser.role;

  let where;
  let needsAgentId = false;
  let needsManagerId = false;

  if (role === "agent") {
    if (view !== "mine") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    where = { userId: authedUser.id };
  } else if (role === "manager") {
    if (view === "mine") {
      where = { userId: authedUser.id };
    } else if (view === "all_my_agents") {
      // Manager: mine + all agents assigned to this manager.
      const agents = await db.User.findAll({
        attributes: ["id"],
        where: { managerId: authedUser.id, role: "agent" },
      });
      const agentUserIds = agents.map((u) => u.id);
      if (agentUserIds.length === 0) {
        where = { userId: authedUser.id };
      } else {
        where = {
          [Op.or]: [
            { userId: authedUser.id },
            { userId: { [Op.in]: agentUserIds } },
          ],
        };
      }
    } else if (view === "agent") {
      needsAgentId = true;
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (role === "admin") {
    if (view === "mine") {
      where = { userId: authedUser.id };
    } else if (view === "all_agents") {
      where = {}; // no filter
    } else if (view === "agent") {
      needsAgentId = true;
    } else if (view === "manager") {
      needsManagerId = true;
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (needsAgentId) {
    if (!agentId || Number.isNaN(agentId)) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    if (role === "manager") {
      // Manager can only view logs for their own agents (not manager/admin calls).
      const agentUser = await db.User.findOne({
        where: { id: agentId, role: "agent", managerId: authedUser.id },
      });
      if (!agentUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Admin can see any agent's logs; Manager sees only agents assigned to them.
    where = { userId: agentId };
  }

  if (needsManagerId) {
    if (!managerId || Number.isNaN(managerId)) {
      return NextResponse.json({ error: "managerId is required" }, { status: 400 });
    }

    // Admin: filter by manager => either include manager's own calls or agents-only.
    const agents = await db.User.findAll({
      attributes: ["id"],
      where: { managerId, role: "agent" },
    });
    const agentUserIds = agents.map((u) => u.id);
    if (includeManagerCalls) {
      if (agentUserIds.length === 0) {
        where = { userId: managerId };
      } else {
        where = {
          [Op.or]: [
            { userId: managerId },
            { userId: { [Op.in]: agentUserIds } },
          ],
        };
      }
    } else {
      if (agentUserIds.length === 0) {
        where = { userId: -1 }; // no results
      } else {
        where = { userId: { [Op.in]: agentUserIds } };
      }
    }
  }

  const calls = await db.CallLog.findAll({
    where,
    order: [["createdAt", "DESC"]],
    attributes: [
      "id",
      "userId",
      "fromNumber",
      "toNumber",
      "direction",
      "status",
      "durationSeconds",
      "createdAt",
    ],
  });

  return NextResponse.json({ calls });
}

