"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn("Customers", "bankName");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("Customers", "bankName", {
      type: Sequelize.STRING(128),
      allowNull: true,
      after: "accountNumber",
    });
  },
};
