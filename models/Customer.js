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
      cellNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      fullName: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      address: {
        type: DataTypes.STRING(255),
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
      accountNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      /** Saved charge amount for outside customers (reused on charge/decline). */
      chargeAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
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
      /** Admin-only billed accounts with no lead. Kept out of the main customers list. */
      isOutside: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      managerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
      },
      agentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
      },
    },
    {
      tableName: "Customers",
      timestamps: true,
      indexes: [
        { unique: true, fields: ["phone"] },
        { fields: ["isOutside"] },
        { fields: ["managerId"] },
        { fields: ["agentId"] },
      ],
    },
  );

  Customer.associate = (models) => {
    Customer.hasMany(models.Lead, { as: "leads", foreignKey: "customerId" });
    Customer.hasMany(models.CustomerPaymentMethod, {
      as: "paymentMethods",
      foreignKey: "customerId",
    });
    Customer.hasMany(models.CustomerCharge, {
      as: "charges",
      foreignKey: "customerId",
    });
    Customer.belongsTo(models.User, { as: "manager", foreignKey: "managerId" });
    Customer.belongsTo(models.User, { as: "agent", foreignKey: "agentId" });
  };

  return Customer;
};
