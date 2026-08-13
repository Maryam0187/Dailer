"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("CustomerCharges", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      customerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Customers", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      customerPaymentMethodId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "CustomerPaymentMethods", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      status: {
        type: Sequelize.ENUM("charged", "declined", "chargeback"),
        allowNull: false,
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      processor: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      declineReason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdByUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("CustomerCharges", ["customerId"], {
      name: "customer_charges_customer_id",
    });
    await queryInterface.addIndex("CustomerCharges", ["createdAt"], {
      name: "customer_charges_created_at",
    });
    await queryInterface.addIndex("CustomerCharges", ["status"], {
      name: "customer_charges_status",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("CustomerCharges");
  },
};
