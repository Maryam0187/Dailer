import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { derivePresence } from "@/server/auth/presence";
import { assertCanManageTarget } from "@/server/auth/userAccess";
import { isWithinLoginWindow } from "@/server/auth/loginWindow";
import { logUserActivity } from "@/server/activity/logUserActivity";
import { getDefaultGrantDurationMinutes } from "@/server/auth/shiftSettings";
import {
  computeGrantExpiresAt,
  parseGrantDurationMinutes,
  resolveGrantDurationMinutes,
} from "@/server/auth/afterShiftGrant.cjs";

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
      "afterShiftAccess",
      "afterShiftLimitedFileId",
      "afterShiftAccessExpiresAt",
      "afterShiftGrantDurationMinutes",
      "activeSessionId",
      "activeSessionLastSeenAt",
    ],
    include: [
      {
        association: "creator",
        attributes: ["id", "username"],
        required: false,
      },
      {
        association: "afterShiftLimitedFile",
        attributes: ["id", "name"],
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
      afterShiftAccess: authedUser.role === "admin" ? target.afterShiftAccess || "none" : undefined,
      afterShiftLimitedFileId:
        authedUser.role === "admin" ? target.afterShiftLimitedFileId ?? null : undefined,
      afterShiftLimitedFileName:
        authedUser.role === "admin" ? target.afterShiftLimitedFile?.name ?? null : undefined,
      afterShiftAccessExpiresAt:
        authedUser.role === "admin" ? target.afterShiftAccessExpiresAt ?? null : undefined,
      afterShiftGrantDurationMinutes:
        authedUser.role === "admin" ? target.afterShiftGrantDurationMinutes ?? null : undefined,
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

  const globalGrantDuration = isAdmin ? await getDefaultGrantDurationMinutes() : null;

  if (isAdmin && body.afterShiftGrantDurationMinutes !== undefined) {
    if (body.afterShiftGrantDurationMinutes == null || body.afterShiftGrantDurationMinutes === "") {
      updates.afterShiftGrantDurationMinutes = null;
    } else {
      const duration = parseGrantDurationMinutes(body.afterShiftGrantDurationMinutes);
      if (!duration) {
        return NextResponse.json({ error: "Invalid afterShiftGrantDurationMinutes" }, { status: 400 });
      }
      updates.afterShiftGrantDurationMinutes = duration;
    }
  }

  if (isAdmin && body.afterShiftAccess !== undefined) {
    if (target.role === "admin") {
      return NextResponse.json(
        { error: "Admin accounts always have full access" },
        { status: 400 },
      );
    }
    const allowedAccess = ["none", "full", "limited"];
    if (!allowedAccess.includes(body.afterShiftAccess)) {
      return NextResponse.json({ error: "Invalid afterShiftAccess" }, { status: 400 });
    }
    updates.afterShiftAccess = body.afterShiftAccess;
    if (body.afterShiftAccess === "none") {
      updates.afterShiftLimitedFileId = null;
      updates.afterShiftAccessExpiresAt = null;
    } else if (body.afterShiftAccess === "full" || body.afterShiftAccess === "limited") {
      const duration = resolveGrantDurationMinutes(
        { ...target.toJSON(), ...updates },
        body.afterShiftAccessDurationMinutes,
        globalGrantDuration,
      );
      updates.afterShiftAccessExpiresAt = computeGrantExpiresAt(duration);
      if (body.afterShiftAccessDurationMinutes !== undefined) {
        updates.afterShiftGrantDurationMinutes = duration;
      }
    }
    if (body.afterShiftAccess !== "limited" && body.afterShiftAccess !== "none") {
      updates.afterShiftLimitedFileId = null;
    }
  }

  if (isAdmin && body.afterShiftLimitedFileId !== undefined) {
    const fileId =
      body.afterShiftLimitedFileId == null ? null : Number(body.afterShiftLimitedFileId);
    if (fileId != null && (!Number.isInteger(fileId) || fileId <= 0)) {
      return NextResponse.json({ error: "Invalid afterShiftLimitedFileId" }, { status: 400 });
    }
    if (fileId != null) {
      const file = await db.UserFile.findByPk(fileId, { attributes: ["id", "userId"] });
      if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
      if (Number(file.userId) !== Number(target.id)) {
        return NextResponse.json({ error: "File must belong to this user" }, { status: 400 });
      }
    }
    updates.afterShiftLimitedFileId = fileId;
  }

  if (isAdmin && body.afterShiftFullAccess !== undefined) {
    if (target.role === "admin") {
      return NextResponse.json(
        { error: "Admin accounts always have full access" },
        { status: 400 },
      );
    }
    updates.afterShiftAccess = body.afterShiftFullAccess ? "full" : "none";
    if (!body.afterShiftFullAccess) {
      updates.afterShiftLimitedFileId = null;
      updates.afterShiftAccessExpiresAt = null;
    } else {
      const duration = resolveGrantDurationMinutes(
        { ...target.toJSON(), ...updates },
        body.afterShiftAccessDurationMinutes,
        globalGrantDuration,
      );
      updates.afterShiftAccessExpiresAt = computeGrantExpiresAt(duration);
      if (body.afterShiftAccessDurationMinutes !== undefined) {
        updates.afterShiftGrantDurationMinutes = duration;
      }
    }
  }

  if (
    isAdmin &&
    body.afterShiftAccessDurationMinutes !== undefined &&
    body.afterShiftAccess === undefined &&
    body.afterShiftFullAccess === undefined &&
    body.afterShiftGrantDurationMinutes === undefined
  ) {
    const currentAccess = updates.afterShiftAccess ?? target.afterShiftAccess ?? "none";
    const duration = parseGrantDurationMinutes(body.afterShiftAccessDurationMinutes);
    if (!duration) {
      return NextResponse.json({ error: "Invalid afterShiftAccessDurationMinutes" }, { status: 400 });
    }
    updates.afterShiftGrantDurationMinutes = duration;
    if (currentAccess === "full" || currentAccess === "limited") {
      updates.afterShiftAccessExpiresAt = computeGrantExpiresAt(duration);
    }
  }

  const nextAccess = updates.afterShiftAccess ?? target.afterShiftAccess ?? "none";
  const nextLimitedFileId =
    updates.afterShiftLimitedFileId !== undefined
      ? updates.afterShiftLimitedFileId
      : target.afterShiftLimitedFileId;
  if (updates.afterShiftAccess === "limited" && !nextLimitedFileId) {
    return NextResponse.json({ error: "Limited access requires a file" }, { status: 400 });
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

  const accessRevoked =
    updates.afterShiftAccess === "none" || body.afterShiftFullAccess === false;
  if (isAdmin && accessRevoked && !isWithinLoginWindow() && target.activeSessionId) {
    await db.User.update(
      { activeSessionId: null, activeSessionLastSeenAt: null },
      { where: { id: target.id } },
    );
  }

  if (isAdmin && (body.afterShiftAccess !== undefined || body.afterShiftFullAccess !== undefined)) {
    const next = updates.afterShiftAccess ?? target.afterShiftAccess ?? "none";
    await logUserActivity({
      req,
      userId: authedUser.id,
      action: next === "none" ? "after_shift_access_revoked" : "after_shift_access_granted",
      entityType: "user",
      entityId: target.id,
      metadata: {
        targetUsername: target.username,
        afterShiftAccess: next,
        afterShiftLimitedFileId: nextLimitedFileId ?? null,
        afterShiftAccessExpiresAt: updates.afterShiftAccessExpiresAt ?? null,
      },
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
      "afterShiftAccess",
      "afterShiftLimitedFileId",
      "afterShiftAccessExpiresAt",
      "afterShiftGrantDurationMinutes",
    ],
    include: [
      {
        association: "afterShiftLimitedFile",
        attributes: ["id", "name"],
        required: false,
      },
    ],
  });

  return NextResponse.json({
    user: fresh
      ? {
          ...fresh.toJSON(),
          afterShiftLimitedFileName: fresh.afterShiftLimitedFile?.name ?? null,
        }
      : fresh,
  });
}
