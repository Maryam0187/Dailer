"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Leads", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      phone: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      firstName: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      lastName: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      company: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      city: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      state: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      zipCode: {
        type: Sequelize.STRING(16),
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("new", "contacted", "callback", "qualified", "closed", "dnc"),
        allowNull: false,
        defaultValue: "new",
      },
      source: {
        type: Sequelize.ENUM("cold_dial", "manual"),
        allowNull: false,
        defaultValue: "manual",
      },
      nextCallbackAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      assignedUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      createdByUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      createdFromCallLogId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "CallLogs", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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

    await queryInterface.addIndex("Leads", ["phone"]);
    await queryInterface.addIndex("Leads", ["assignedUserId"]);
    await queryInterface.addIndex("Leads", ["status"]);
    await queryInterface.addIndex("Leads", ["createdByUserId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Leads");
  },
};
