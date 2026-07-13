"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const columns = [
      "label",
      "last4",
      "billingName",
      "billingZip",
      "accountLast4",
      "routingLast4",
    ];
    for (const column of columns) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.removeColumn("CustomerPaymentMethods", column);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("CustomerPaymentMethods", "label", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await queryInterface.addColumn("CustomerPaymentMethods", "last4", {
      type: Sequelize.STRING(4),
      allowNull: true,
    });
    await queryInterface.addColumn("CustomerPaymentMethods", "billingName", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await queryInterface.addColumn("CustomerPaymentMethods", "billingZip", {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
    await queryInterface.addColumn("CustomerPaymentMethods", "accountLast4", {
      type: Sequelize.STRING(4),
      allowNull: true,
    });
    await queryInterface.addColumn("CustomerPaymentMethods", "routingLast4", {
      type: Sequelize.STRING(4),
      allowNull: true,
    });
  },
};
