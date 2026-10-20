"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("AttendanceDailyRecords", "statusOverride", {
      type: Sequelize.STRING(16),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("AttendanceDailyRecords", "statusOverride");
  },
};
