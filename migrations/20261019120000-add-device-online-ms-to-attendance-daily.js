"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("AttendanceDailyRecords", "desktopOnlineMs", {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("AttendanceDailyRecords", "mobileOnlineMs", {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("AttendanceDailyRecords", "mobileOnlineMs");
    await queryInterface.removeColumn("AttendanceDailyRecords", "desktopOnlineMs");
  },
};
