"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "canTrainSalesBot", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.createTable("SalesBotProfiles", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING(64),
        allowNull: false,
        defaultValue: "Sales Assistant",
      },
      instructions: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      updatedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.createTable("SalesBotTrainingExamples", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      question: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      answer: {
        type: Sequelize.STRING(1000),
        allowNull: false,
      },
      updatedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.createTable("SalesBotTrainingChanges", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      action: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      summary: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("SalesBotTrainingChanges", ["createdAt"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("SalesBotTrainingChanges");
    await queryInterface.dropTable("SalesBotTrainingExamples");
    await queryInterface.dropTable("SalesBotProfiles");
    await queryInterface.removeColumn("Users", "canTrainSalesBot");
  },
};
