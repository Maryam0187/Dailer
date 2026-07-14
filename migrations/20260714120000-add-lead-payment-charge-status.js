"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "leadPaymentChargeStatus", {
      type: Sequelize.ENUM("charged", "declined", "chargeback"),
      allowNull: true,
    });
    await queryInterface.addColumn("Leads", "leadPaymentDeclineReason", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addIndex("Leads", ["leadPaymentChargeStatus"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Leads", ["leadPaymentChargeStatus"]).catch(() => {});
    await queryInterface.removeColumn("Leads", "leadPaymentDeclineReason");
    await queryInterface.removeColumn("Leads", "leadPaymentChargeStatus");
  },
};
