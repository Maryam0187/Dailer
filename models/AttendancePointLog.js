"use strict";

module.exports = (sequelize, DataTypes) => {
  const AttendancePointLog = sequelize.define(
    "AttendancePointLog",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      calendarDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      pointPercent: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      reason: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      tierKey: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
    },
    {
      tableName: "AttendancePointLogs",
      timestamps: true,
      indexes: [
        { fields: ["userId", "calendarDate"] },
        { fields: ["userId", "calendarDate", "reason"], unique: true },
      ],
    },
  );

  AttendancePointLog.associate = (models) => {
    AttendancePointLog.belongsTo(models.User, { foreignKey: "userId", as: "user" });
  };

  return AttendancePointLog;
};
