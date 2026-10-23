"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CallLogs", "zoomExtensionNumber", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "zoomPhoneNumber", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "zoomDisplayName", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "zoomConnectedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("CallLogs", "zoomConnectedAt");
    await queryInterface.removeColumn("CallLogs", "zoomDisplayName");
    await queryInterface.removeColumn("CallLogs", "zoomPhoneNumber");
    await queryInterface.removeColumn("CallLogs", "zoomExtensionNumber");
  },
};
