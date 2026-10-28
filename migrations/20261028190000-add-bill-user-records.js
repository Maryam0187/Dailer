"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Bills", "userRecords", {
      type: Sequelize.JSON,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Bills", "userRecords");
  },
};
