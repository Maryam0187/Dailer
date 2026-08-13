"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Customers", "address", {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: "fullName",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Customers", "address");
  },
};
