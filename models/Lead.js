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
      serviceType: {
        type: DataTypes.ENUM("dish", "direct", "cable", "streams"),
        allowNull: true,
      },
      cableName: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      streamName: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      breakdown: {
        type: DataTypes.TEXT,
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
      processorUserId: {
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
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Customers", key: "id" },
      },
      customerPaymentMethodId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "CustomerPaymentMethods", key: "id" },
      },
      leadPhase: {
        type: DataTypes.ENUM("active", "closed", "cancelled"),
        allowNull: false,
        defaultValue: "active",
      },
      leadProgressTags: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      },
      leadProcessedRequired: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      leadContactTag: {
        type: DataTypes.ENUM("voicemail", "hangup", "no_response", "appointment", "sale_done"),
        allowNull: true,
      },
      leadContactCounts: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
      },
      leadAppointmentAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      leadAppointmentNote: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      leadPaymentMethod: {
        type: DataTypes.ENUM("check_mail", "e_check", "card", "pos_link"),
        allowNull: true,
      },
      leadCancelReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "Leads",
      timestamps: true,
      indexes: [
        { fields: ["phone"] },
        { fields: ["assignedUserId"] },
        { fields: ["processorUserId"] },
        { fields: ["status"] },
        { fields: ["createdByUserId"] },
        { fields: ["leadPhase"] },
      ],
    },
  );

  Lead.associate = (models) => {
    Lead.belongsTo(models.User, { as: "assignedUser", foreignKey: "assignedUserId" });
    Lead.belongsTo(models.User, { as: "processorUser", foreignKey: "processorUserId" });
    Lead.belongsTo(models.User, { as: "createdBy", foreignKey: "createdByUserId" });
    Lead.belongsTo(models.CallLog, { as: "createdFromCall", foreignKey: "createdFromCallLogId" });
    Lead.belongsTo(models.Customer, { as: "customer", foreignKey: "customerId" });
    Lead.belongsTo(models.CustomerPaymentMethod, {
      as: "customerPaymentMethod",
      foreignKey: "customerPaymentMethodId",
    });
    Lead.hasMany(models.CallLog, { foreignKey: "leadId", as: "callLogs" });
    Lead.hasMany(models.LeadUpdate, { foreignKey: "leadId", as: "updates" });
  };

  return Lead;
};
