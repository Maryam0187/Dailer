"use strict";

module.exports = (sequelize, DataTypes) => {
  const CustomerCharge = sequelize.define(
    "CustomerCharge",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Customers", key: "id" },
      },
      customerPaymentMethodId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "CustomerPaymentMethods", key: "id" },
      },
      status: {
        type: DataTypes.ENUM("charged", "declined", "chargeback"),
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      processor: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      declineReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      createdByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
      },
    },
    {
      tableName: "CustomerCharges",
      timestamps: true,
      indexes: [
        { fields: ["customerId"] },
        { fields: ["createdAt"] },
        { fields: ["status"] },
      ],
    },
  );

  CustomerCharge.associate = (models) => {
    CustomerCharge.belongsTo(models.Customer, {
      as: "customer",
      foreignKey: "customerId",
    });
    CustomerCharge.belongsTo(models.CustomerPaymentMethod, {
      as: "paymentMethod",
      foreignKey: "customerPaymentMethodId",
    });
    CustomerCharge.belongsTo(models.User, {
      as: "createdBy",
      foreignKey: "createdByUserId",
    });
  };

  return CustomerCharge;
};
