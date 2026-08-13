"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "isOutside", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: "isActive",
    });
    await queryInterface.addIndex("Users", ["isOutside"], {
      name: "users_is_outside",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Users", "users_is_outside");
    await queryInterface.removeColumn("Users", "isOutside");
  },
};
