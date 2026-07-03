"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("LeaveApplications", "status", {
      type: Sequelize.ENUM("pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "pending",
    });

    await queryInterface.addColumn("LeaveApplications", "reviewedBy", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addColumn("LeaveApplications", "reviewedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("LeaveApplications", "reviewedAt");
    await queryInterface.removeColumn("LeaveApplications", "reviewedBy");
    await queryInterface.changeColumn("LeaveApplications", "status", {
      type: Sequelize.ENUM("approved"),
      allowNull: false,
      defaultValue: "approved",
    });
  },
};
