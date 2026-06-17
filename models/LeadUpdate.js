"use strict";

module.exports = (sequelize, DataTypes) => {
  const LeadUpdate = sequelize.define(
    "LeadUpdate",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      leadId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Leads", key: "id" },
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      type: {
        type: DataTypes.STRING(24),
        allowNull: false,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      previousStatus: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      newStatus: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
    },
    {
      tableName: "LeadUpdates",
      timestamps: true,
      indexes: [
        { fields: ["leadId"] },
        { fields: ["userId"] },
        { fields: ["createdAt"] },
      ],
    },
  );

  LeadUpdate.associate = (models) => {
    LeadUpdate.belongsTo(models.Lead, { foreignKey: "leadId", as: "lead" });
    LeadUpdate.belongsTo(models.User, { foreignKey: "userId", as: "author" });
  };

  return LeadUpdate;
};
