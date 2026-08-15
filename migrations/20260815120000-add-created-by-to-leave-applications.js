"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("LeaveApplications", "createdByUserId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
      after: "userId",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("LeaveApplications", "createdByUserId");
  },
};
