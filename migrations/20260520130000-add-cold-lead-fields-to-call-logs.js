"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CallLogs", "callKind", {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "dialMode", {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "leadId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Leads", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addColumn("CallLogs", "disposition", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "dispositionAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "contactName", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "city", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "state", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "zipCode", {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "agentCallSid", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });

    await queryInterface.addIndex("CallLogs", ["callKind"]);
    await queryInterface.addIndex("CallLogs", ["leadId"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("CallLogs", ["leadId"]);
    await queryInterface.removeIndex("CallLogs", ["callKind"]);
    await queryInterface.removeColumn("CallLogs", "agentCallSid");
    await queryInterface.removeColumn("CallLogs", "zipCode");
    await queryInterface.removeColumn("CallLogs", "state");
    await queryInterface.removeColumn("CallLogs", "city");
    await queryInterface.removeColumn("CallLogs", "contactName");
    await queryInterface.removeColumn("CallLogs", "dispositionAt");
    await queryInterface.removeColumn("CallLogs", "disposition");
    await queryInterface.removeColumn("CallLogs", "leadId");
    await queryInterface.removeColumn("CallLogs", "dialMode");
    await queryInterface.removeColumn("CallLogs", "callKind");
  },
};
