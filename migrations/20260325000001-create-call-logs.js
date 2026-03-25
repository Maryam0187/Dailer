"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("CallLogs", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      fromNumber: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      toNumber: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      direction: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: "outbound",
      },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "queued",
      },
      durationSeconds: {
        type: Sequelize.INTEGER,
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

    await queryInterface.addIndex("CallLogs", ["userId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("CallLogs");
  },
};

