import { Op } from "sequelize";
import db from "@/server/db";
import { getSessionCalendarDate } from "@/server/auth/loginWindow";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVE_LEAVE_STATUSES = ["pending", "approved"];

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
  return application?.status === "pending";
}

export function canUserDeleteLeaveApplication(application) {
  return application?.status === "pending";
}

export function serializeLeaveApplication(row, fallbackUsername = null) {
  return {
    id: row.id,
    userId: row.userId,
    username: row.user?.username ?? fallbackUsername,
    startDate: row.startDate,
    endDate: row.endDate,
    reason: row.reason,
    status: row.status,
    reviewedAt: row.reviewedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canEdit: canUserEditLeaveReason(row),
    canDelete: canUserDeleteLeaveApplication(row),
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
    status: "pending",
  });
}

export async function updateLeaveApplicationReason({ applicationId, userId, reason }) {
  const row = await db.LeaveApplication.findByPk(applicationId);
  if (!row || row.userId !== userId) {
    throw new Error("Application not found.");
  }

  if (!canUserEditLeaveReason(row)) {
    throw new Error("Reason can only be edited before admin approval.");
  }

  const trimmedReason = String(reason || "").trim();
  row.reason = trimmedReason || null;
  await row.save();

  return row;
}

export async function deleteLeaveApplication({ applicationId, userId }) {
  const row = await db.LeaveApplication.findByPk(applicationId);
  if (!row || row.userId !== userId) {
    throw new Error("Application not found.");
  }

  if (!canUserDeleteLeaveApplication(row)) {
    throw new Error("Only pending applications can be cancelled.");
  }

  await row.destroy();
  return row;
}

export async function updateLeaveApplicationStatus({ applicationId, status, reviewedBy }) {
  if (status !== "approved" && status !== "rejected") {
    throw new Error("Status must be approved or rejected.");
  }

  const row = await db.LeaveApplication.findByPk(applicationId);
  if (!row) {
    throw new Error("Application not found.");
  }

  if (row.status !== "pending") {
    throw new Error("Only pending applications can be reviewed.");
  }

  if (status === "approved") {
    if (await hasOverlappingLeaveApplication(row.userId, row.startDate, row.endDate, applicationId)) {
      throw new Error("This user already has another approved or pending leave for these dates.");
    }
  }

  row.status = status;
  row.reviewedBy = reviewedBy ?? null;
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
