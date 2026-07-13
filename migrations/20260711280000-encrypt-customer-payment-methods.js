"use strict";

const {
  ENCRYPTED_PAYMENT_FIELDS,
  isEncryptedValue,
  encryptField,
} = require("../src/server/crypto/paymentFieldEncryption.cjs");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const textFields = [
      "cardType",
      "brand",
      "cardNumber",
      "expDate",
      "cvv",
      "routingNumber",
      "accountNumber",
      "checkNumber",
      "bankName",
      "notes",
    ];

    for (const field of textFields) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.changeColumn("CustomerPaymentMethods", field, {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    const [rows] = await queryInterface.sequelize.query(
      "SELECT `id`, `cardType`, `brand`, `cardNumber`, `expDate`, `cvv`, `routingNumber`, `accountNumber`, `checkNumber`, `bankName`, `notes` FROM `CustomerPaymentMethods`",
    );

    for (const row of rows) {
      const updates = {};
      for (const field of ENCRYPTED_PAYMENT_FIELDS) {
        const value = row[field];
        if (value == null || value === "") continue;
        if (isEncryptedValue(value)) continue;
        updates[field] = encryptField(value);
      }
      if (Object.keys(updates).length === 0) continue;

      const setClauses = Object.keys(updates)
        .map((field) => `\`${field}\` = :${field}`)
        .join(", ");
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(
        `UPDATE \`CustomerPaymentMethods\` SET ${setClauses} WHERE \`id\` = :id`,
        {
          replacements: { id: row.id, ...updates },
        },
      );
    }
  },

  async down(queryInterface, Sequelize) {
    // Cannot safely restore plaintext without decrypting; leave TEXT columns.
    await queryInterface.changeColumn("CustomerPaymentMethods", "cardType", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.changeColumn("CustomerPaymentMethods", "brand", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.changeColumn("CustomerPaymentMethods", "cardNumber", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.changeColumn("CustomerPaymentMethods", "expDate", {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
    await queryInterface.changeColumn("CustomerPaymentMethods", "cvv", {
      type: Sequelize.STRING(8),
      allowNull: true,
    });
    await queryInterface.changeColumn("CustomerPaymentMethods", "routingNumber", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.changeColumn("CustomerPaymentMethods", "accountNumber", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.changeColumn("CustomerPaymentMethods", "checkNumber", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.changeColumn("CustomerPaymentMethods", "bankName", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
  },
};
