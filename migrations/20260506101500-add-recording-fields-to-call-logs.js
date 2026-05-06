"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CallLogs", "recordingSid", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "recordingStatus", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "recordingDurationSeconds", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addIndex("CallLogs", ["recordingSid"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("CallLogs", ["recordingSid"]);
    await queryInterface.removeColumn("CallLogs", "recordingDurationSeconds");
    await queryInterface.removeColumn("CallLogs", "recordingStatus");
    await queryInterface.removeColumn("CallLogs", "recordingSid");
  },
};

