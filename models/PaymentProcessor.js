"use strict";

module.exports = (sequelize, DataTypes) => {
  const PaymentProcessor = sequelize.define(
    "PaymentProcessor",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      code: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      fullName: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      shortCode: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      tone: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "zinc",
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "PaymentProcessors",
      timestamps: true,
    },
  );

  return PaymentProcessor;
};
