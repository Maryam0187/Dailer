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
