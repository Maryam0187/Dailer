"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("CallLogs");
    if (table.customerAnsweredAt) return;
    await queryInterface.addColumn("CallLogs", "customerAnsweredAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("CallLogs");
    if (!table.customerAnsweredAt) return;
    await queryInterface.removeColumn("CallLogs", "customerAnsweredAt");
  },
};
