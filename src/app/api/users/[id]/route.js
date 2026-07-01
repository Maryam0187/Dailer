import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { derivePresence } from "@/server/auth/presence";
import { assertCanManageTarget } from "@/server/auth/userAccess";
import { isWithinLoginWindow } from "@/server/auth/loginWindow";
import { logUserActivity } from "@/server/activity/logUserActivity";

export async function GET(_req, { params }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const target = await db.User.findByPk(id, {
    attributes: [
      "id",
      "username",
      "role",
      "managerId",
      "supervisorId",
      "createdBy",
      "createdAt",
      "isActive",
      "afterShiftFullAccess",
      "activeSessionId",
      "activeSessionLastSeenAt",
    ],
    include: [
      {
        association: "creator",
        attributes: ["id", "username"],
        required: false,
      },
    ],
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await assertCanManageTarget(authedUser, target);
  if (!allowed && authedUser.id !== target.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const presence = derivePresence({
    id: target.id,
    activeSessionId: target.activeSessionId,
    activeSessionLastSeenAt: target.activeSessionLastSeenAt,
  });

  return NextResponse.json({
    user: {
      id: target.id,
      username: target.username,
      role: target.role,
      managerId: target.managerId,
      supervisorId: target.supervisorId,
      createdBy: target.createdBy ?? null,
      createdByUsername: target.creator?.username ?? null,
      createdAt: target.createdAt,
      isActive: target.isActive !== false,
      afterShiftFullAccess: authedUser.role === "admin" ? target.afterShiftFullAccess === true : undefined,
      presence: presence.status,
      lastActiveAt: presence.lastActiveAt,
    },
  });
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

  if (!isAdmin && (body.role !== undefined || body.managerId !== undefined || body.supervisorId !== undefined)) {
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
    const allowedRoles = ["agent", "manager", "supervisor", "admin", "lead_monitor"];
    if (!allowedRoles.includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    updates.role = body.role;
    if (body.role !== "agent" && body.role !== "supervisor") {
      updates.managerId = null;
      updates.supervisorId = null;
    }
  }

  const effectiveRole = updates.role ?? target.role;

  if (isAdmin && (effectiveRole === "agent" || effectiveRole === "supervisor")) {
    if (body.managerId !== undefined) {
      const parsed = body.managerId != null ? Number(body.managerId) : null;
      if (effectiveRole === "agent" && (!parsed || Number.isNaN(parsed))) {
        return NextResponse.json({ error: "Invalid managerId" }, { status: 400 });
      }
      if (parsed && !Number.isNaN(parsed)) {
        const managerUser = await db.User.findOne({
          where: { id: parsed, role: "manager", isActive: true },
        });
        if (!managerUser) {
          return NextResponse.json(
            { error: "managerId must be an active manager" },
            { status: 400 },
          );
        }
        updates.managerId = parsed;
      } else {
        updates.managerId = null;
      }
    }
  }
  if (isAdmin && effectiveRole === "agent" && body.supervisorId !== undefined) {
    const parsedSupervisor = body.supervisorId != null ? Number(body.supervisorId) : null;
    if (parsedSupervisor && !Number.isNaN(parsedSupervisor)) {
      const supervisorUser = await db.User.findOne({
        where: { id: parsedSupervisor, role: "supervisor", isActive: true },
        attributes: ["id", "managerId"],
      });
      if (!supervisorUser) {
        return NextResponse.json(
          { error: "supervisorId must be an active supervisor" },
          { status: 400 },
        );
      }
      updates.supervisorId = parsedSupervisor;
      if (!updates.managerId && !target.managerId && supervisorUser.managerId) {
        updates.managerId = supervisorUser.managerId;
      }
    } else {
      updates.supervisorId = null;
    }
  } else if (isAdmin && effectiveRole !== "agent") {
    updates.supervisorId = null;
  }

  if (body.isActive !== undefined) {
    updates.isActive = Boolean(body.isActive);
  }

  if (isAdmin && body.afterShiftFullAccess !== undefined) {
    if (target.role === "admin") {
      return NextResponse.json(
        { error: "Admin accounts always have full access" },
        { status: 400 },
      );
    }
    updates.afterShiftFullAccess = Boolean(body.afterShiftFullAccess);
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

  if (
    isAdmin &&
    body.afterShiftFullAccess === false &&
    !isWithinLoginWindow() &&
    target.activeSessionId
  ) {
    await db.User.update(
      { activeSessionId: null, activeSessionLastSeenAt: null },
      { where: { id: target.id } },
    );
  }

  if (isAdmin && body.afterShiftFullAccess !== undefined) {
    const granted = Boolean(body.afterShiftFullAccess);
    await logUserActivity({
      req,
      userId: authedUser.id,
      action: granted ? "after_shift_access_granted" : "after_shift_access_revoked",
      entityType: "user",
      entityId: target.id,
      metadata: { targetUsername: target.username },
    });
  }

  const fresh = await db.User.findByPk(id, {
    attributes: [
      "id",
      "username",
      "role",
      "managerId",
      "supervisorId",
      "createdAt",
      "isActive",
      "afterShiftFullAccess",
    ],
  });

  return NextResponse.json({ user: fresh });
}
