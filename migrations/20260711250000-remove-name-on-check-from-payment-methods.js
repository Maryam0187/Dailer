"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn("CustomerPaymentMethods", "nameOnCheck");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("CustomerPaymentMethods", "nameOnCheck", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
  },
};
