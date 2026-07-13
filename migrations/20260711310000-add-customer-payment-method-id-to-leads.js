"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "customerPaymentMethodId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "CustomerPaymentMethods",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addIndex("Leads", ["customerPaymentMethodId"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Leads", ["customerPaymentMethodId"]).catch(() => {});
    await queryInterface.removeColumn("Leads", "customerPaymentMethodId");
  },
};
