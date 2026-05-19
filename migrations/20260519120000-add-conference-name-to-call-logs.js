"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CallLogs", "conferenceName", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await queryInterface.addIndex("CallLogs", ["conferenceName"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("CallLogs", ["conferenceName"]);
    await queryInterface.removeColumn("CallLogs", "conferenceName");
  },
};
