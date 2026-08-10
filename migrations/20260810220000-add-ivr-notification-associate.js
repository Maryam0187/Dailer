"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("IvrNotifications", "associate", {
      type: Sequelize.STRING(8),
      allowNull: true,
      after: "choice",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("IvrNotifications", "associate");
  },
};
