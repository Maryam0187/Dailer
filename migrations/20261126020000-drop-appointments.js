"use strict";

/** Appointments live on Leads and SoftwareLeads. This table was never used by the app. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable("Appointments");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.createTable("Appointments", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      leadId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Leads", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      softwareLeadId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "SoftwareLeads", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      appointmentAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      note: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdByUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
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
  },
};
