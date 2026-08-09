"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("IvrNotifications", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      callSid: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      lastEventType: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "incoming",
      },
      step: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      fromNumber: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      toNumber: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      choice: {
        type: Sequelize.STRING(16),
        allowNull: true,
      },
      numberEntered: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      readAt: {
        type: Sequelize.DATE,
        allowNull: true,
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

    await queryInterface.addIndex("IvrNotifications", ["callSid"]);
    await queryInterface.addIndex("IvrNotifications", ["createdAt"]);
    await queryInterface.addIndex("IvrNotifications", ["readAt"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("IvrNotifications");
  },
};
