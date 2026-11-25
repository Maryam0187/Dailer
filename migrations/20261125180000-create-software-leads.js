"use strict";

/** Software telemarketing leads. Separate from TV Leads. Appointments use the same columns. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("SoftwareLeads", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      phone: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      fullName: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      company: {
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
        onDelete: "RESTRICT",
      },
      leadPhase: {
        type: Sequelize.ENUM("active", "closed", "cancelled"),
        allowNull: false,
        defaultValue: "active",
      },
      leadContactTag: {
        type: Sequelize.ENUM("voicemail", "hangup", "no_response", "appointment", "sale_done"),
        allowNull: true,
      },
      leadAppointmentAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      leadAppointmentNote: {
        type: Sequelize.TEXT,
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
    await queryInterface.addIndex("SoftwareLeads", ["phone"]);
    await queryInterface.addIndex("SoftwareLeads", ["assignedUserId"]);
    await queryInterface.addIndex("SoftwareLeads", ["createdByUserId"]);
    await queryInterface.addIndex("SoftwareLeads", ["status"]);
    await queryInterface.addIndex("SoftwareLeads", ["leadAppointmentAt"]);
    await queryInterface.addIndex("SoftwareLeads", ["createdAt"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("SoftwareLeads");
  },
};
