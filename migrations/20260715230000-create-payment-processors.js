"use strict";

const PAYMENT_PROCESSOR_SEEDS = [
  { code: "auth", fullName: "Auth", shortCode: "PA", tone: "indigo", sortOrder: 10 },
  { code: "kurv", fullName: "Kurv", shortCode: "PC", tone: "teal", sortOrder: 20 },
  { code: "cardpointe", fullName: "Cardpointe", shortCode: "CP", tone: "sky", sortOrder: 30 },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("PaymentProcessors", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      code: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      fullName: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      shortCode: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      tone: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "zinc",
      },
      sortOrder: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("PaymentProcessors", ["code"], {
      unique: true,
      name: "payment_processors_code_unique",
    });

    const now = new Date();
    await queryInterface.bulkInsert(
      "PaymentProcessors",
      PAYMENT_PROCESSOR_SEEDS.map((row) => ({
        ...row,
        active: true,
        createdAt: now,
        updatedAt: now,
      })),
    );

    // Allow any processor code going forward (was ENUM of the three seeds).
    await queryInterface.changeColumn("Leads", "leadPaymentProcessor", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Leads", "leadPaymentProcessor", {
      type: Sequelize.ENUM("auth", "kurv", "cardpointe"),
      allowNull: true,
    });
    await queryInterface.dropTable("PaymentProcessors");
  },
};
