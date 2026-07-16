"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "leadPaymentChargeAmount", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Leads", "leadPaymentChargeAmount");
  },
};
