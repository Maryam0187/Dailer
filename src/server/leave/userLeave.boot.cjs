"use strict";

const { Op } = require("sequelize");
const db = require("../../../models");
const { getSessionCalendarDate } = require("../auth/loginWindow.core.cjs");

async function isUserOnApprovedLeave(userId, date = new Date()) {
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

module.exports = {
  isUserOnApprovedLeave,
};
