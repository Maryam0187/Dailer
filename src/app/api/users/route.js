import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (authedUser.role === "admin") {
    const users = await db.User.findAll({
      attributes: ["id", "username", "role", "managerId", "supervisorId", "createdAt", "isActive"],
      order: [["createdAt", "DESC"]],
    });
    return NextResponse.json({ users });
  }

  if (authedUser.role === "manager") {
    // Manager: list their agents (not all users).
    const users = await db.User.findAll({
      attributes: ["id", "username", "role", "managerId", "supervisorId", "createdAt", "isActive"],
      where: { managerId: authedUser.id },
      order: [["createdAt", "DESC"]],
    });
    return NextResponse.json({ users });
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
    // Manager can only create agents.
    if (role !== "agent") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsedSupervisor = supervisorId ? Number(supervisorId) : null;
    let supervisorIdToSet = null;
    if (parsedSupervisor && !Number.isNaN(parsedSupervisor)) {
      const supervisorUser = await db.User.findOne({
        where: { id: parsedSupervisor, role: "supervisor", managerId: authedUser.id, isActive: true },
      });
      if (!supervisorUser) {
        return NextResponse.json({ error: "supervisorId must be an active supervisor under you" }, { status: 400 });
      }
      supervisorIdToSet = parsedSupervisor;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const user = await db.User.create({
        username: username.trim(),
        passwordHash,
        role: "agent",
        managerId: authedUser.id,
        supervisorId: supervisorIdToSet,
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
      // Unique constraint violation for username.
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
      const managerUser = await db.User.findOne({ where: { id: parsed, role: "manager" } });
      if (!managerUser) {
        return NextResponse.json(
          { error: "managerId must point to a manager user" },
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

