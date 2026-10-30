"use strict";

module.exports = (sequelize, DataTypes) => {
  const IvrSetting = sequelize.define(
    "IvrSetting",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      /** Outbound CallLog lookback (days) for inbound callback agent affinity. */
      callbackAffinityDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 6,
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
      tableName: "IvrSettings",
      timestamps: true,
    },
  );

  IvrSetting.associate = (models) => {
    IvrSetting.belongsTo(models.User, {
      as: "updatedByUser",
      foreignKey: "updatedBy",
    });
  };

  return IvrSetting;
};
