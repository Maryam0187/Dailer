"use strict";

/** One appointment row per lead. Existing TV appointments are copied off the lead columns. */
module.exports = {
  async up(queryInterface, Sequelize) {
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
    await queryInterface.addIndex("Appointments", ["leadId"], {
      unique: true,
      name: "appointments_lead_id",
    });
    await queryInterface.addIndex("Appointments", ["softwareLeadId"], {
      unique: true,
      name: "appointments_software_lead_id",
    });
    await queryInterface.addIndex("Appointments", ["appointmentAt"], {
      name: "appointments_appointment_at",
    });

    await queryInterface.sequelize.query(`
      INSERT INTO Appointments (leadId, softwareLeadId, appointmentAt, note, createdByUserId, createdAt, updatedAt)
      SELECT id, NULL, leadAppointmentAt, leadAppointmentNote, createdByUserId, NOW(), NOW()
      FROM Leads
      WHERE leadContactTag = 'appointment' AND leadAppointmentAt IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Appointments");
  },
};
