"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Customers", "cellNumber", {
      type: Sequelize.STRING(32),
      allowNull: true,
      after: "phone",
    });
    await queryInterface.addColumn("Customers", "accountNumber", {
      type: Sequelize.STRING(32),
      allowNull: true,
      after: "zipCode",
    });
    await queryInterface.addColumn("Customers", "bankName", {
      type: Sequelize.STRING(128),
      allowNull: true,
      after: "accountNumber",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Customers", "bankName");
    await queryInterface.removeColumn("Customers", "accountNumber");
    await queryInterface.removeColumn("Customers", "cellNumber");
  },
};
