"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CustomerPaymentMethods", "nameOnCard", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("CustomerPaymentMethods", "nameOnCard");
  },
};
