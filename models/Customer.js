"use strict";

module.exports = (sequelize, DataTypes) => {
  const Customer = sequelize.define(
    "Customer",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      phone: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
      },
      fullName: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      city: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      state: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      zipCode: {
        type: DataTypes.STRING(16),
        allowNull: true,
      },
      serviceType: {
        type: DataTypes.ENUM("dish", "direct", "cable", "streams"),
        allowNull: true,
      },
      cableName: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      streamName: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
    },
    {
      tableName: "Customers",
      timestamps: true,
      indexes: [{ unique: true, fields: ["phone"] }],
    },
  );

  Customer.associate = (models) => {
    Customer.hasMany(models.Lead, { as: "leads", foreignKey: "customerId" });
    Customer.hasMany(models.CustomerPaymentMethod, {
      as: "paymentMethods",
      foreignKey: "customerId",
    });
  };

  return Customer;
};
