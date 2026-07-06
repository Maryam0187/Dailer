"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Leads", "leadContactTag", {
      type: Sequelize.ENUM("voicemail", "hangup", "no_response", "appointment", "sale_done"),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Leads", "leadContactTag", {
      type: Sequelize.ENUM("voicemail", "hangup", "no_response", "appointment"),
      allowNull: true,
    });
  },
};
