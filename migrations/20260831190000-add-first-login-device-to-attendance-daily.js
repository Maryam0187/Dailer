"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("AttendanceDailyRecords", "firstLoginDevice", {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("AttendanceDailyRecords", "firstLoginDevice");
  },
};
