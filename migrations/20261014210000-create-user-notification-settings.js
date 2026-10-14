"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("UserNotificationSettings", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      scheduleEnabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      timezone: {
        type: Sequelize.STRING(64),
        allowNull: false,
        defaultValue: "Asia/Karachi",
      },
      allowStartLocal: {
        type: Sequelize.STRING(5),
        allowNull: false,
        defaultValue: "09:00",
      },
      allowEndLocal: {
        type: Sequelize.STRING(5),
        allowNull: false,
        defaultValue: "18:00",
      },
      allowDays: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: [1, 2, 3, 4, 5],
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

    await queryInterface.addIndex("UserNotificationSettings", ["userId"], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("UserNotificationSettings");
  },
};
