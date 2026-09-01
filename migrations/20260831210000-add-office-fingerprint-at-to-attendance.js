"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("AttendanceDailyRecords", "officeFingerprintAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("AttendanceDailyRecords", "officeFingerprintAt");
  },
};
