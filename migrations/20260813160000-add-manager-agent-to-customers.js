"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Customers", "managerId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
      after: "isOutside",
    });
    await queryInterface.addColumn("Customers", "agentId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
      after: "managerId",
    });
    await queryInterface.addIndex("Customers", ["managerId"], {
      name: "customers_manager_id",
    });
    await queryInterface.addIndex("Customers", ["agentId"], {
      name: "customers_agent_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Customers", "customers_agent_id");
    await queryInterface.removeIndex("Customers", "customers_manager_id");
    await queryInterface.removeColumn("Customers", "agentId");
    await queryInterface.removeColumn("Customers", "managerId");
  },
};
