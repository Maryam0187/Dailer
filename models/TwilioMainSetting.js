"use strict";

module.exports = (sequelize, DataTypes) => {
  const TwilioMainSetting = sequelize.define(
    "TwilioMainSetting",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      accountSid: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      authToken: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      apiKeySid: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      apiKeySecret: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      /** Default Line 1 From (E.164). */
      phoneNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      /** Default Line 2 From (E.164). */
      phoneNumber2: {
        type: DataTypes.STRING(32),
        allowNull: true,
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
      tableName: "TwilioMainSettings",
      timestamps: true,
    },
  );

  TwilioMainSetting.associate = (models) => {
    TwilioMainSetting.belongsTo(models.User, {
      as: "updatedByUser",
      foreignKey: "updatedBy",
    });
  };

  return TwilioMainSetting;
};
