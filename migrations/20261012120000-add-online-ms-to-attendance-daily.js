"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("AttendanceDailyRecords", "onlineMs", {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("AttendanceDailyRecords", "onlineMs");
  },
};
