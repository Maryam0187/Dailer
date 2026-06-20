"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("UserActivities", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
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
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      entityType: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      entityId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      ipAddress: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },
      userAgent: {
        type: Sequelize.STRING(512),
        allowNull: true,
      },
      sessionId: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSON,
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

    await queryInterface.addIndex("UserActivities", ["userId"]);
    await queryInterface.addIndex("UserActivities", ["action"]);
    await queryInterface.addIndex("UserActivities", ["createdAt"]);
    await queryInterface.addIndex("UserActivities", ["sessionId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("UserActivities");
  },
};
