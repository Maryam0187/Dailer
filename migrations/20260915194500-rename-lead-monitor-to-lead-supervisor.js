"use strict";

const ENUM_WITH_BOTH = [
  "agent",
  "manager",
  "supervisor",
  "admin",
  "lead_monitor",
  "lead_supervisor",
  "processor",
];

const ENUM_AFTER = ["agent", "manager", "supervisor", "admin", "lead_supervisor", "processor"];
const ENUM_BEFORE = ["agent", "manager", "supervisor", "admin", "lead_monitor", "processor"];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Users", "role", {
      type: Sequelize.ENUM(...ENUM_WITH_BOTH),
      allowNull: false,
      defaultValue: "agent",
    });
    await queryInterface.sequelize.query(
      "UPDATE `Users` SET `role` = 'lead_supervisor' WHERE `role` = 'lead_monitor'",
    );
    await queryInterface.changeColumn("Users", "role", {
      type: Sequelize.ENUM(...ENUM_AFTER),
      allowNull: false,
      defaultValue: "agent",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Users", "role", {
      type: Sequelize.ENUM(...ENUM_WITH_BOTH),
      allowNull: false,
      defaultValue: "agent",
    });
    await queryInterface.sequelize.query(
      "UPDATE `Users` SET `role` = 'lead_monitor' WHERE `role` = 'lead_supervisor'",
    );
    await queryInterface.changeColumn("Users", "role", {
      type: Sequelize.ENUM(...ENUM_BEFORE),
      allowNull: false,
      defaultValue: "agent",
    });
  },
};
