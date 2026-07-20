"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ImportBatches", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      createdByUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      fileName: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      createdCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      skippedCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      revertedAt: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex("ImportBatches", ["createdAt"]);
    await queryInterface.addIndex("ImportBatches", ["createdByUserId"]);

    await queryInterface.addColumn("Leads", "importBatchId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "ImportBatches", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addIndex("Leads", ["importBatchId"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Leads", ["importBatchId"]);
    await queryInterface.removeColumn("Leads", "importBatchId");
    await queryInterface.dropTable("ImportBatches");
  },
};
