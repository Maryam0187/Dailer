"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn("CustomerPaymentMethods", "expMonth");
    await queryInterface.removeColumn("CustomerPaymentMethods", "expYear");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("CustomerPaymentMethods", "expMonth", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn("CustomerPaymentMethods", "expYear", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },
};
