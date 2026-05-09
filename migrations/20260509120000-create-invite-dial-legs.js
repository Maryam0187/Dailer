"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("InviteDialLegs", {
      callSid: {
        type: Sequelize.STRING(64),
        allowNull: false,
        primaryKey: true,
      },
      callLogId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "CallLogs",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      conferenceName: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      invitedUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
    await queryInterface.addIndex("InviteDialLegs", ["invitedUserId"]);
    await queryInterface.addIndex("InviteDialLegs", ["callLogId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("InviteDialLegs");
  },
};
