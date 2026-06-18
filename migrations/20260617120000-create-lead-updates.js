"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("LeadUpdates", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      leadId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Leads", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      type: {
        type: Sequelize.STRING(24),
        allowNull: false,
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      previousStatus: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      newStatus: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("LeadUpdates", ["leadId"]);
    await queryInterface.addIndex("LeadUpdates", ["userId"]);
    await queryInterface.addIndex("LeadUpdates", ["createdAt"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("LeadUpdates");
  },
};
