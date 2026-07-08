import { Op } from "sequelize";
import db from "@/server/db";
import { getSessionCalendarDate } from "@/server/auth/loginWindow";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVE_LEAVE_STATUSES = ["approved"];

function isLeaveNotYetStarted(application, today = getSessionCalendarDate()) {
  return Boolean(application?.startDate && application.startDate >= today);
}

export function parseLeaveDateInput(value) {
  const trimmed = String(value || "").trim();
  if (!DATE_RE.test(trimmed)) return null;
  const [year, month, day] = trimmed.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return trimmed;
}

export function isLeaveRangeValid(startDate, endDate, today = getSessionCalendarDate()) {
  if (!startDate || !endDate) return false;
  if (startDate > endDate) return false;
  if (startDate < today) return false;
  return true;
}

export function canUserEditLeaveReason(application) {
  return application?.status === "approved" && isLeaveNotYetStarted(application);
}

export function canAdminCancelLeaveApplication(application) {
  return application?.status === "approved";
}

export function canUserRequestLeaveCancellation(application) {
  return application?.status === "approved" && !application?.cancelRequestedAt;
}

export function serializeLeaveApplication(row, fallbackUsername = null, { forAdmin = false } = {}) {
  return {
    id: row.id,
    userId: row.userId,
    username: row.user?.username ?? fallbackUsername,
    startDate: row.startDate,
    endDate: row.endDate,
    reason: row.reason,
    status: row.status,
    reviewedAt: row.reviewedAt ?? null,
    cancelRequestedAt: row.cancelRequestedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canEdit: forAdmin ? false : canUserEditLeaveReason(row),
    canCancel: forAdmin ? canAdminCancelLeaveApplication(row) : false,
    canRequestCancel: forAdmin ? false : canUserRequestLeaveCancellation(row),
    cancelRequested: Boolean(row.cancelRequestedAt),
  };
}

export async function isUserOnApprovedLeave(userId, date = new Date()) {
  if (!userId) return false;

  const today = getSessionCalendarDate(date);
  const row = await db.LeaveApplication.findOne({
    where: {
      userId,
      status: "approved",
      startDate: { [Op.lte]: today },
      endDate: { [Op.gte]: today },
    },
    attributes: ["id"],
  });

  return Boolean(row);
}

export async function getCurrentApprovedLeaveByUserIds(userIds, date = new Date()) {
  const normalizedIds = [...new Set((userIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (normalizedIds.length === 0) return new Map();

  const today = getSessionCalendarDate(date);
  const rows = await db.LeaveApplication.findAll({
    where: {
      userId: { [Op.in]: normalizedIds },
      status: "approved",
      startDate: { [Op.lte]: today },
      endDate: { [Op.gte]: today },
    },
    attributes: ["id", "userId", "startDate", "endDate", "reason", "status"],
    order: [
      ["startDate", "ASC"],
      ["id", "ASC"],
    ],
  });

  const leaveByUserId = new Map();
  for (const row of rows) {
    if (leaveByUserId.has(row.userId)) continue;
    leaveByUserId.set(row.userId, serializeLeaveApplication(row));
  }
  return leaveByUserId;
}

export async function hasOverlappingLeaveApplication(userId, startDate, endDate, excludeId = null) {
  const where = {
    userId,
    status: { [Op.in]: ACTIVE_LEAVE_STATUSES },
    startDate: { [Op.lte]: endDate },
    endDate: { [Op.gte]: startDate },
  };
  if (excludeId != null) where.id = { [Op.ne]: excludeId };

  const row = await db.LeaveApplication.findOne({
    where,
    attributes: ["id"],
  });

  return Boolean(row);
}

export async function createLeaveApplication({ userId, startDate, endDate, reason }) {
  const today = getSessionCalendarDate();
  if (!isLeaveRangeValid(startDate, endDate, today)) {
    throw new Error("Leave dates must be valid and cannot start in the past.");
  }

  if (await hasOverlappingLeaveApplication(userId, startDate, endDate)) {
    throw new Error("You already have leave applied for one or more of these dates.");
  }

  const trimmedReason = String(reason || "").trim();

  return db.LeaveApplication.create({
    userId,
    startDate,
    endDate,
    reason: trimmedReason || null,
    status: "approved",
    reviewedAt: new Date(),
  });
}

export async function updateLeaveApplicationReason({ applicationId, userId, reason }) {
  const row = await db.LeaveApplication.findByPk(applicationId);
  if (!row || row.userId !== userId) {
    throw new Error("Application not found.");
  }

  if (!canUserEditLeaveReason(row)) {
    throw new Error("Reason can only be edited before leave starts.");
  }

  const trimmedReason = String(reason || "").trim();
  row.reason = trimmedReason || null;
  await row.save();

  return row;
}

export async function requestLeaveCancellation({ applicationId, userId }) {
  const row = await db.LeaveApplication.findByPk(applicationId);
  if (!row || row.userId !== userId) {
    throw new Error("Application not found.");
  }

  if (!canUserRequestLeaveCancellation(row)) {
    if (row.cancelRequestedAt) {
      throw new Error("Cancellation has already been requested for this application.");
    }
    throw new Error("This leave application cannot be cancelled.");
  }

  row.cancelRequestedAt = new Date();
  await row.save();

  return row;
}

export async function cancelLeaveApplication({ applicationId, cancelledBy }) {
  const row = await db.LeaveApplication.findByPk(applicationId);
  if (!row) {
    throw new Error("Application not found.");
  }

  if (!canAdminCancelLeaveApplication(row)) {
    throw new Error("Only active leave applications can be cancelled.");
  }

  row.status = "cancelled";
  row.reviewedBy = cancelledBy ?? null;
  row.reviewedAt = new Date();
  await row.save();

  return row;
}

export async function listLeaveApplicationsForUser(userId) {
  return db.LeaveApplication.findAll({
    where: { userId },
    order: [
      ["startDate", "DESC"],
      ["id", "DESC"],
    ],
  });
}

export async function listAllLeaveApplications() {
  return db.LeaveApplication.findAll({
    include: [
      {
        model: db.User,
        as: "user",
        attributes: ["id", "username", "role"],
      },
    ],
    order: [
      ["startDate", "DESC"],
      ["id", "DESC"],
    ],
  });
}

export async function getLeaveApplicationForUser(applicationId, userId) {
  const row = await db.LeaveApplication.findOne({
    where: { id: applicationId, userId },
  });
  return row;
}
