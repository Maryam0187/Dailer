"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("UserActivities", "deviceType", {
      type: Sequelize.STRING(16),
      allowNull: true,
    });

    await queryInterface.addColumn("AttendanceDailyRecords", "lastLoginDevice", {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("AttendanceDailyRecords", "lastLoginDevice");
    await queryInterface.removeColumn("UserActivities", "deviceType");
  },
};
