"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Customers", "chargeAmount", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
      after: "accountNumber",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Customers", "chargeAmount");
  },
};
