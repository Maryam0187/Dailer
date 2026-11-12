"use strict";

module.exports = (sequelize, DataTypes) => {
  const BlockedNumber = sequelize.define(
    "BlockedNumber",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      /** E.164 destination that must not be dialed on Twilio or Zoom. */
      phoneNumber: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
      },
      reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Users",
          key: "id",
        },
      },
    },
    {
      tableName: "BlockedNumbers",
      timestamps: true,
    },
  );

  BlockedNumber.associate = (models) => {
    BlockedNumber.belongsTo(models.User, {
      as: "createdByUser",
      foreignKey: "createdBy",
    });
  };

  return BlockedNumber;
};
