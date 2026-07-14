"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "leadPaymentProcessor", {
      type: Sequelize.ENUM("auth", "kurv", "cardpointe"),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Leads", "leadPaymentProcessor");
  },
};
