"use strict";

module.exports = (sequelize, DataTypes) => {
  const UserActivity = sequelize.define(
    "UserActivity",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
      },
      action: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      entityType: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      entityId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      ipAddress: {
        type: DataTypes.STRING(45),
        allowNull: true,
      },
      country: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      region: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      city: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      area: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      userAgent: {
        type: DataTypes.STRING(512),
        allowNull: true,
      },
      sessionId: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
      },
    },
    {
      tableName: "UserActivities",
      timestamps: true,
      indexes: [
        { fields: ["userId"] },
        { fields: ["action"] },
        { fields: ["createdAt"] },
        { fields: ["sessionId"] },
      ],
    },
  );

  UserActivity.associate = (models) => {
    UserActivity.belongsTo(models.User, { foreignKey: "userId", as: "user" });
  };

  return UserActivity;
};
