"use strict";

module.exports = (sequelize, DataTypes) => {
  const CallLog = sequelize.define(
    "CallLog",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },
      fromNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      toNumber: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      direction: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "outbound",
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "queued",
      },
      durationSeconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      tableName: "CallLogs",
      timestamps: true,
      indexes: [{ fields: ["userId"] }],
    },
  );

  CallLog.associate = (models) => {
    CallLog.belongsTo(models.User, { as: "user", foreignKey: "userId" });
  };

  return CallLog;
};

