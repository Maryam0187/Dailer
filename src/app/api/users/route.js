import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { derivePresence } from "@/server/auth/presence";
import { sortUsersForDisplay } from "@/lib/sortUsers";
const LIST_ATTRIBUTES = [
  "id",
  "username",
  "role",
  "managerId",
  "supervisorId",
  "createdBy",
  "createdAt",
  "isActive",
  "activeSessionId",
  "activeSessionLastSeenAt",
];

const LIST_INCLUDE = [
  {
    association: "creator",
    attributes: ["id", "username"],
    required: false,
  },
];

function serializeUserRow(row, now) {
  const presence = derivePresence(
    {
      id: row.id,
      activeSessionId: row.activeSessionId,
      activeSessionLastSeenAt: row.activeSessionLastSeenAt,
    },
    now,
  );
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    managerId: row.managerId,
    supervisorId: row.supervisorId,
    createdBy: row.createdBy ?? null,
    createdByUsername: row.creator?.username ?? null,
    createdAt: row.createdAt,
    isActive: row.isActive !== false,
    presence: presence.status,
    lastActiveAt: presence.lastActiveAt,
  };
}

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (authedUser.role === "admin") {
    const rows = await db.User.findAll({
      attributes: LIST_ATTRIBUTES,
      include: LIST_INCLUDE,
      order: [["createdAt", "DESC"]],
    });
    const now = Date.now();
    return NextResponse.json({
      users: sortUsersForDisplay(rows.map((r) => serializeUserRow(r, now))),
    });
  }

  if (authedUser.role === "manager") {
    const rows = await db.User.findAll({
      attributes: LIST_ATTRIBUTES,
      include: LIST_INCLUDE,
      where: { managerId: authedUser.id },
      order: [["createdAt", "DESC"]],
    });
    const now = Date.now();
    return NextResponse.json({
      users: sortUsersForDisplay(rows.map((r) => serializeUserRow(r, now))),
    });
  }

  if (authedUser.role === "supervisor") {
    const rows = await db.User.findAll({
      attributes: LIST_ATTRIBUTES,
      include: LIST_INCLUDE,
      where: { role: "agent", supervisorId: authedUser.id },
      order: [["createdAt", "DESC"]],
    });
    const now = Date.now();
    return NextResponse.json({
      users: sortUsersForDisplay(rows.map((r) => serializeUserRow(r, now))),
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const username = body?.username;
  const password = body?.password;
  const role = body?.role;
  const managerId = body?.managerId;
  const supervisorId = body?.supervisorId;

  if (!username || !password) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  if (typeof username !== "string" || username.trim().length < 3) {
    return NextResponse.json({ error: "username must be at least 3 characters" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "password must be at least 6 characters" }, { status: 400 });
  }

  if (authedUser.role === "manager") {
    if (role !== "agent" && role !== "supervisor") {
      return NextResponse.json({ error: "Managers can only create agents or supervisors" }, { status: 403 });
    }

    let supervisorIdToSet = null;
    if (role === "agent") {
      const parsedSupervisor = supervisorId ? Number(supervisorId) : null;
      if (parsedSupervisor && !Number.isNaN(parsedSupervisor)) {
        const supervisorUser = await db.User.findOne({
          where: {
            id: parsedSupervisor,
            role: "supervisor",
            managerId: authedUser.id,
            isActive: true,
          },
        });
        if (!supervisorUser) {
          return NextResponse.json(
            { error: "supervisorId must be an active supervisor under you" },
            { status: 400 },
          );
        }
        supervisorIdToSet = parsedSupervisor;
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const user = await db.User.create({
        username: username.trim(),
        passwordHash,
        role,
        managerId: authedUser.id,
        supervisorId: role === "agent" ? supervisorIdToSet : null,
        createdBy: authedUser.id,
      });
      return NextResponse.json(
        {
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            managerId: user.managerId,
            supervisorId: user.supervisorId,
            isActive: user.isActive,
          },
        },
        { status: 201 },
      );
    } catch (err) {
      if (String(err?.name).includes("SequelizeUniqueConstraintError")) {
        return NextResponse.json({ error: "username already exists" }, { status: 409 });
      }
      throw err;
    }
  }

  if (authedUser.role === "supervisor") {
    if (role && role !== "agent") {
      return NextResponse.json({ error: "Supervisors can only create agents" }, { status: 403 });
    }

    const supervisorRow = await db.User.findByPk(authedUser.id, {
      attributes: ["id", "role", "managerId", "isActive"],
    });
    if (!supervisorRow || supervisorRow.role !== "supervisor" || !supervisorRow.isActive) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const user = await db.User.create({
        username: username.trim(),
        passwordHash,
        role: "agent",
        managerId: supervisorRow.managerId ?? null,
        supervisorId: authedUser.id,
        createdBy: authedUser.id,
      });
      return NextResponse.json(
        {
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            managerId: user.managerId,
            supervisorId: user.supervisorId,
            isActive: user.isActive,
          },
        },
        { status: 201 },
      );
    } catch (err) {
      if (String(err?.name).includes("SequelizeUniqueConstraintError")) {
        return NextResponse.json({ error: "username already exists" }, { status: 409 });
      }
      throw err;
    }
  }

  if (authedUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Admin can create any role.
  const allowedRoles = ["agent", "manager", "supervisor", "admin"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  let managerIdToSet = null;
  let supervisorIdToSet = null;
  if (role === "agent" || role === "supervisor") {
    const parsed = managerId ? Number(managerId) : null;
    if (parsed && !Number.isNaN(parsed)) {
      const managerUser = await db.User.findOne({
        where: { id: parsed, role: "manager", isActive: true },
      });
      if (!managerUser) {
        return NextResponse.json(
          { error: "managerId must point to an active manager" },
          { status: 400 },
        );
      }
      managerIdToSet = parsed;
    }
  }
  if (role === "agent") {
    const parsedSupervisor = supervisorId ? Number(supervisorId) : null;
    if (parsedSupervisor && !Number.isNaN(parsedSupervisor)) {
      const supervisorUser = await db.User.findOne({
        where: { id: parsedSupervisor, role: "supervisor", isActive: true },
        attributes: ["id", "managerId"],
      });
      if (!supervisorUser) {
        return NextResponse.json({ error: "supervisorId must point to an active supervisor" }, { status: 400 });
      }
      supervisorIdToSet = parsedSupervisor;
      if (!managerIdToSet && supervisorUser.managerId) {
        managerIdToSet = supervisorUser.managerId;
      }
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await db.User.create({
      username: username.trim(),
      passwordHash,
      role,
      managerId: managerIdToSet,
      supervisorId: supervisorIdToSet,
      createdBy: authedUser.id,
    });
    return NextResponse.json(
      {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          managerId: user.managerId,
          supervisorId: user.supervisorId,
          isActive: user.isActive,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (String(err?.name).includes("SequelizeUniqueConstraintError")) {
      return NextResponse.json({ error: "username already exists" }, { status: 409 });
    }
    throw err;
  }
}

