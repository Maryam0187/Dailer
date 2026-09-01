"use strict";

module.exports = (sequelize, DataTypes) => {
  const AttendanceDailyRecord = sequelize.define(
    "AttendanceDailyRecord",
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
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "present",
      },
      tierKey: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      pointPercent: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      pointsEarned: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      firstLoginAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      lastLoginAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      loginCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      minutesAfterStart: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      firstLoginDevice: {
        type: DataTypes.STRING(16),
        allowNull: true,
      },
      lastLoginDevice: {
        type: DataTypes.STRING(16),
        allowNull: true,
      },
      officeFingerprintAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "AttendanceDailyRecords",
      timestamps: true,
      indexes: [
        { fields: ["userId", "calendarDate"], unique: true },
        { fields: ["calendarDate"] },
      ],
    },
  );

  AttendanceDailyRecord.associate = (models) => {
    AttendanceDailyRecord.belongsTo(models.User, { foreignKey: "userId", as: "user" });
  };

  return AttendanceDailyRecord;
};
