"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("IvrQueuedCalls", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      callSid: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      conferenceName: {
        type: Sequelize.STRING(128),
        allowNull: false,
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
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "waiting",
      },
      lastRingAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: false,
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

    await queryInterface.addIndex("IvrQueuedCalls", ["conferenceName"], {
      unique: true,
      name: "ivr_queued_calls_conference_name_unique",
    });
    await queryInterface.addIndex("IvrQueuedCalls", ["callSid"]);
    await queryInterface.addIndex("IvrQueuedCalls", ["status"]);
    await queryInterface.addIndex("IvrQueuedCalls", ["expiresAt"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("IvrQueuedCalls");
  },
};
