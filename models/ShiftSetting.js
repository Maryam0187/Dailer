"use strict";

module.exports = (sequelize, DataTypes) => {
  const ShiftSetting = sequelize.define(
    "ShiftSetting",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      key: {
        type: DataTypes.STRING(16),
        allowNull: false,
        unique: true,
        defaultValue: "day",
      },
      name: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: "Day",
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      startUtc: {
        type: DataTypes.STRING(5),
        allowNull: false,
        defaultValue: "13:00",
      },
      endUtc: {
        type: DataTypes.STRING(5),
        allowNull: false,
        defaultValue: "18:00",
      },
      timezone: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: "Asia/Karachi",
      },
      afterShiftGrantDurationMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 120,
      },
      leaveDays: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [0],
      },
      manuallyActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Users",
          key: "id",
        },
      },
    },
    {
      tableName: "ShiftSettings",
      timestamps: true,
    },
  );

  ShiftSetting.associate = (models) => {
    ShiftSetting.belongsTo(models.User, { as: "updatedByUser", foreignKey: "updatedBy" });
  };

  return ShiftSetting;
};
