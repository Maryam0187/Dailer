"use strict";

/**
 * Optional TOTP (Google Authenticator) for admin accounts.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "totpSecretEncrypted", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn("Users", "totpEnabled", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("Users", "totpEnabledAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Users", "totpEnabledAt");
    await queryInterface.removeColumn("Users", "totpEnabled");
    await queryInterface.removeColumn("Users", "totpSecretEncrypted");
  },
};
