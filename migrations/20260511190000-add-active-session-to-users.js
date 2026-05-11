"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "activeSessionId", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn("Users", "activeSessionLastSeenAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex("Users", ["activeSessionId"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Users", ["activeSessionId"]);
    await queryInterface.removeColumn("Users", "activeSessionLastSeenAt");
    await queryInterface.removeColumn("Users", "activeSessionId");
  },
};
