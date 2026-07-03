"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("ShiftSettings", "leaveDays", {
      type: Sequelize.JSON,
      allowNull: false,
      defaultValue: [0],
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("ShiftSettings", "leaveDays");
  },
};
