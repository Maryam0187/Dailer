"use strict";

/**
 * Version bump invalidates "remember this device" TOTP trust cookies.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "totpTrustVersion", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Users", "totpTrustVersion");
  },
};
