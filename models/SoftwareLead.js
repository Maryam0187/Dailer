"use strict";

module.exports = (sequelize, DataTypes) => {
  const SoftwareLead = sequelize.define(
    "SoftwareLead",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      phone: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      fullName: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      company: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      city: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      state: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      zipCode: {
        type: DataTypes.STRING(16),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("new", "contacted", "callback", "qualified", "closed", "dnc"),
        allowNull: false,
        defaultValue: "new",
      },
      assignedUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
      },
      createdByUserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      leadPhase: {
        type: DataTypes.ENUM("active", "closed", "cancelled"),
        allowNull: false,
        defaultValue: "active",
      },
      /** Same appointment fields as TV leads, so the appointments screen can list both. */
      leadContactTag: {
        type: DataTypes.ENUM("voicemail", "hangup", "no_response", "appointment", "sale_done"),
        allowNull: true,
      },
      leadAppointmentAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      leadAppointmentNote: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "SoftwareLeads",
      timestamps: true,
      indexes: [
        { fields: ["phone"] },
        { fields: ["assignedUserId"] },
        { fields: ["createdByUserId"] },
        { fields: ["status"] },
        { fields: ["leadAppointmentAt"] },
        { fields: ["createdAt"] },
      ],
    },
  );

  SoftwareLead.associate = (models) => {
    SoftwareLead.belongsTo(models.User, { as: "assignedUser", foreignKey: "assignedUserId" });
    SoftwareLead.belongsTo(models.User, { as: "createdBy", foreignKey: "createdByUserId" });
  };

  return SoftwareLead;
};
