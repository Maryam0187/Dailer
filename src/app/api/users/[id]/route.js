import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

async function assertCanManageTarget(authedUser, target) {
  if (authedUser.role === "admin") return true;
  if (authedUser.role === "manager") {
    return target.role === "agent" && target.managerId === authedUser.id;
  }
  return false;
}

export async function PATCH(req, { params }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const target = await db.User.findByPk(id);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await assertCanManageTarget(authedUser, target);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const isAdmin = authedUser.role === "admin";

  if (!isAdmin && (body.role !== undefined || body.managerId !== undefined)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (authedUser.id === id && body.isActive === false) {
    return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
  }

  const updates = {};

  if (body.username !== undefined) {
    if (typeof body.username !== "string" || body.username.trim().length < 3) {
      return NextResponse.json({ error: "username must be at least 3 characters" }, { status: 400 });
    }
    updates.username = body.username.trim();
  }

  if (body.password !== undefined && body.password !== "") {
    if (typeof body.password !== "string" || body.password.length < 6) {
      return NextResponse.json({ error: "password must be at least 6 characters" }, { status: 400 });
    }
    updates.passwordHash = await bcrypt.hash(body.password, 10);
  }

  if (isAdmin && body.role !== undefined) {
    const allowedRoles = ["agent", "manager", "admin"];
    if (!allowedRoles.includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    updates.role = body.role;
    if (body.role !== "agent") {
      updates.managerId = null;
    }
  }

  const effectiveRole = updates.role ?? target.role;

  if (isAdmin && effectiveRole === "agent") {
    if (body.managerId !== undefined) {
      const parsed = body.managerId != null ? Number(body.managerId) : null;
      if (!parsed || Number.isNaN(parsed)) {
        return NextResponse.json({ error: "Invalid managerId" }, { status: 400 });
      }
      const managerUser = await db.User.findOne({
        where: { id: parsed, role: "manager", isActive: true },
      });
      if (!managerUser) {
        return NextResponse.json({ error: "managerId must be an active manager" }, { status: 400 });
      }
      updates.managerId = parsed;
    } else if (updates.role === "agent" && target.role !== "agent") {
      return NextResponse.json(
        { error: "managerId is required when changing role to agent" },
        { status: 400 },
      );
    }
  }

  if (body.isActive !== undefined) {
    updates.isActive = Boolean(body.isActive);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    await target.update(updates);
  } catch (err) {
    if (String(err?.name).includes("SequelizeUniqueConstraintError")) {
      return NextResponse.json({ error: "username already exists" }, { status: 409 });
    }
    throw err;
  }

  const fresh = await db.User.findByPk(id, {
    attributes: ["id", "username", "role", "managerId", "createdAt", "isActive"],
  });

  return NextResponse.json({ user: fresh });
}
