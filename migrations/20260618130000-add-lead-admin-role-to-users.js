"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Users", "role", {
      type: Sequelize.ENUM("agent", "manager", "supervisor", "admin", "lead_monitor"),
      allowNull: false,
      defaultValue: "agent",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "UPDATE `Users` SET `role` = 'agent' WHERE `role` = 'lead_monitor'",
    );
    await queryInterface.changeColumn("Users", "role", {
      type: Sequelize.ENUM("agent", "manager", "supervisor", "admin"),
      allowNull: false,
      defaultValue: "agent",
    });
  },
};
