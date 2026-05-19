"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CallLogs", "customerCallSid", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "agentDurationSeconds", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "customerDurationSeconds", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addIndex("CallLogs", ["customerCallSid"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("CallLogs", ["customerCallSid"]);
    await queryInterface.removeColumn("CallLogs", "customerDurationSeconds");
    await queryInterface.removeColumn("CallLogs", "agentDurationSeconds");
    await queryInterface.removeColumn("CallLogs", "customerCallSid");
  },
};
