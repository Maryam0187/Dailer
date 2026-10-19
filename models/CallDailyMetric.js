"use strict";

module.exports = (sequelize, DataTypes) => {
  const CallDailyMetric = sequelize.define(
    "CallDailyMetric",
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
      total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      completed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      noAnswer: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      failedOrCanceled: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      busy: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      durationSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      confTotal: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      confCompleted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      confNoAnswer: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      confFailedOrCanceled: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      confBusy: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      confDurationSeconds: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "CallDailyMetrics",
      timestamps: true,
      indexes: [
        { fields: ["userId", "calendarDate"], unique: true },
        { fields: ["calendarDate"] },
      ],
    },
  );

  CallDailyMetric.associate = (models) => {
    CallDailyMetric.belongsTo(models.User, { foreignKey: "userId", as: "user" });
  };

  return CallDailyMetric;
};
