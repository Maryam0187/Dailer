"use strict";

module.exports = (sequelize, DataTypes) => {
  const BillingSetting = sequelize.define(
    "BillingSetting",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      fixedMarkupPerCall: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0,
      },
      currency: {
        type: DataTypes.STRING(8),
        allowNull: false,
        defaultValue: "USD",
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
      tableName: "BillingSettings",
      timestamps: true,
    },
  );

  BillingSetting.associate = (models) => {
    BillingSetting.belongsTo(models.User, { as: "updatedByUser", foreignKey: "updatedBy" });
  };

  return BillingSetting;
};
