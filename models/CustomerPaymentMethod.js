"use strict";

module.exports = (sequelize, DataTypes) => {
  const {
    applyEncryptToInstance,
    applyDecryptToInstance,
  } = require("../src/server/crypto/paymentFieldEncryption.cjs");

  const CustomerPaymentMethod = sequelize.define(
    "CustomerPaymentMethod",
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
      type: {
        type: DataTypes.ENUM("card", "e_check", "check_mail", "pos_link"),
        allowNull: false,
      },
      isDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      nameOnCard: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      cardType: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      brand: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      cardNumber: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      expDate: {
        type: DataTypes.STRING(16),
        allowNull: true,
      },
      cvv: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      routingNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      accountNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      checkNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      bankName: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      createdByUserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
    },
    {
      tableName: "CustomerPaymentMethods",
      timestamps: true,
      indexes: [{ fields: ["customerId"] }, { fields: ["type"] }],
      hooks: {
        beforeCreate(instance) {
          applyEncryptToInstance(instance);
        },
        beforeUpdate(instance) {
          applyEncryptToInstance(instance);
        },
        afterFind(result) {
          if (!result) return;
          // findAndCountAll / nested includes can pass { rows, count } or plain objects (raw: true)
          const rows = Array.isArray(result)
            ? result
            : Array.isArray(result.rows)
              ? result.rows
              : [result];
          for (const row of rows) {
            applyDecryptToInstance(row);
          }
        },
      },
    },
  );

  CustomerPaymentMethod.associate = (models) => {
    CustomerPaymentMethod.belongsTo(models.Customer, {
      as: "customer",
      foreignKey: "customerId",
    });
    CustomerPaymentMethod.belongsTo(models.User, {
      as: "createdBy",
      foreignKey: "createdByUserId",
    });
    if (models.Lead) {
      CustomerPaymentMethod.hasMany(models.Lead, {
        as: "chargedLeads",
        foreignKey: "customerPaymentMethodId",
      });
    }
  };

  return CustomerPaymentMethod;
};
