"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Customers", "isOutside", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: "streamName",
    });
    await queryInterface.addIndex("Customers", ["isOutside"], {
      name: "customers_is_outside",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Customers", "customers_is_outside");
    await queryInterface.removeColumn("Customers", "isOutside");
  },
};
