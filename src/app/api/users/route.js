import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (authedUser.role === "admin") {
    const users = await db.User.findAll({
      attributes: ["id", "username", "role", "managerId", "createdAt"],
      order: [["createdAt", "DESC"]],
    });
    return NextResponse.json({ users });
  }

  if (authedUser.role === "manager") {
    // Manager: list their agents (not all users).
    const users = await db.User.findAll({
      attributes: ["id", "username", "role", "managerId", "createdAt"],
      where: { role: "agent", managerId: authedUser.id },
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

    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const user = await db.User.create({
        username: username.trim(),
        passwordHash,
        role: "agent",
        managerId: authedUser.id,
      });
      return NextResponse.json(
        { user: { id: user.id, username: user.username, role: user.role, managerId: user.managerId } },
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
  const allowedRoles = ["agent", "manager", "admin"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  let managerIdToSet = null;
  if (role === "agent") {
    const parsed = managerId ? Number(managerId) : null;
    if (!parsed || Number.isNaN(parsed)) {
      return NextResponse.json({ error: "managerId is required for agent" }, { status: 400 });
    }

    const managerUser = await db.User.findOne({ where: { id: parsed, role: "manager" } });
    if (!managerUser) {
      return NextResponse.json({ error: "managerId must point to a manager user" }, { status: 400 });
    }
    managerIdToSet = parsed;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await db.User.create({
      username: username.trim(),
      passwordHash,
      role,
      managerId: managerIdToSet,
    });
    return NextResponse.json(
      { user: { id: user.id, username: user.username, role: user.role, managerId: user.managerId } },
      { status: 201 },
    );
  } catch (err) {
    if (String(err?.name).includes("SequelizeUniqueConstraintError")) {
      return NextResponse.json({ error: "username already exists" }, { status: 409 });
    }
    throw err;
  }
}

