"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Customers", "notes", {
      type: Sequelize.TEXT,
      allowNull: true,
      after: "zipCode",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Customers", "notes");
  },
};
