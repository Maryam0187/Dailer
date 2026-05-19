"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CallLogs", "pendingConferenceName", {
      type: Sequelize.STRING(128),
      allowNull: true,
      comment:
        "Set during REST conference upgrade — Dial action moves agent leg into conference, then persists conferenceName.",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("CallLogs", "pendingConferenceName");
  },
};
