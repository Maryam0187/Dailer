"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CustomerPaymentMethods", "cardType", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("CustomerPaymentMethods", "cardNumber", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("CustomerPaymentMethods", "expDate", {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
    await queryInterface.addColumn("CustomerPaymentMethods", "cvv", {
      type: Sequelize.STRING(8),
      allowNull: true,
    });
    await queryInterface.addColumn("CustomerPaymentMethods", "routingNumber", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("CustomerPaymentMethods", "accountNumber", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("CustomerPaymentMethods", "checkNumber", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("CustomerPaymentMethods", "nameOnCheck", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("CustomerPaymentMethods", "cardType");
    await queryInterface.removeColumn("CustomerPaymentMethods", "cardNumber");
    await queryInterface.removeColumn("CustomerPaymentMethods", "expDate");
    await queryInterface.removeColumn("CustomerPaymentMethods", "cvv");
    await queryInterface.removeColumn("CustomerPaymentMethods", "routingNumber");
    await queryInterface.removeColumn("CustomerPaymentMethods", "accountNumber");
    await queryInterface.removeColumn("CustomerPaymentMethods", "checkNumber");
    await queryInterface.removeColumn("CustomerPaymentMethods", "nameOnCheck");
  },
};
