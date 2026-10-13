"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("TwilioMainSettings", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      accountSid: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      authToken: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      apiKeySid: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      apiKeySecret: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      phoneNumber: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      phoneNumber2: {
        type: Sequelize.STRING(32),
        allowNull: true,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable("TwilioMainSettings");
  },
};
