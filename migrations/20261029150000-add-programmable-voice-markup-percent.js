"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("BillingSettings", "programmableVoiceMarkupPercent", {
      type: Sequelize.DECIMAL(6, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("Bills", "programmableVoiceMarkupPercent", {
      type: Sequelize.DECIMAL(6, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("Bills", "programmableVoiceMarkupAmount", {
      type: Sequelize.DECIMAL(12, 4),
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Bills", "programmableVoiceMarkupAmount");
    await queryInterface.removeColumn("Bills", "programmableVoiceMarkupPercent");
    await queryInterface.removeColumn("BillingSettings", "programmableVoiceMarkupPercent");
  },
};
