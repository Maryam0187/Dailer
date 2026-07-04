"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("LeaveApplications", "status", {
      type: Sequelize.ENUM("pending", "approved", "rejected", "cancelled"),
      allowNull: false,
      defaultValue: "approved",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE LeaveApplications SET status = 'approved' WHERE status = 'cancelled'
    `);

    await queryInterface.changeColumn("LeaveApplications", "status", {
      type: Sequelize.ENUM("pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "approved",
    });
  },
};
