"use strict";

module.exports = (sequelize, DataTypes) => {
  const Lead = sequelize.define(
    "Lead",
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
      cellNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      company: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      email: {
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
      source: {
        type: DataTypes.ENUM("cold_dial", "manual"),
        allowNull: false,
        defaultValue: "manual",
      },
      nextCallbackAt: {
        type: DataTypes.DATE,
        allowNull: true,
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
      createdFromCallLogId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "CallLogs", key: "id" },
      },
    },
    {
      tableName: "Leads",
      timestamps: true,
      indexes: [
        { fields: ["phone"] },
        { fields: ["assignedUserId"] },
        { fields: ["status"] },
        { fields: ["createdByUserId"] },
      ],
    },
  );

  Lead.associate = (models) => {
    Lead.belongsTo(models.User, { as: "assignedUser", foreignKey: "assignedUserId" });
    Lead.belongsTo(models.User, { as: "createdBy", foreignKey: "createdByUserId" });
    Lead.belongsTo(models.CallLog, { as: "createdFromCall", foreignKey: "createdFromCallLogId" });
    Lead.hasMany(models.CallLog, { foreignKey: "leadId", as: "callLogs" });
    Lead.hasMany(models.LeadUpdate, { foreignKey: "leadId", as: "updates" });
  };

  return Lead;
};
