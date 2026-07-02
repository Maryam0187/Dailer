"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "afterShiftAccessExpiresAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("ShiftSettings", "afterShiftGrantDurationMinutes", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 120,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("ShiftSettings", "afterShiftGrantDurationMinutes");
    await queryInterface.removeColumn("Users", "afterShiftAccessExpiresAt");
  },
};
