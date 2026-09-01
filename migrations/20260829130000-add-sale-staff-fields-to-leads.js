"use strict";

/** Per-sale account # and outside manager/agent on Leads (outside_sale rows). */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "accountNumber", {
      type: Sequelize.STRING(32),
      allowNull: true,
      after: "zipCode",
    });
    await queryInterface.addColumn("Leads", "managerId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
      after: "customerId",
    });
    await queryInterface.addColumn("Leads", "agentId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
      after: "managerId",
    });
    await queryInterface.addIndex("Leads", ["managerId"], {
      name: "leads_manager_id",
    });
    await queryInterface.addIndex("Leads", ["agentId"], {
      name: "leads_agent_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Leads", "leads_agent_id");
    await queryInterface.removeIndex("Leads", "leads_manager_id");
    await queryInterface.removeColumn("Leads", "agentId");
    await queryInterface.removeColumn("Leads", "managerId");
    await queryInterface.removeColumn("Leads", "accountNumber");
  },
};
