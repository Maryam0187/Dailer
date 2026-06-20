"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("UserActivities", "latitude", {
      type: Sequelize.DECIMAL(10, 7),
      allowNull: true,
    });
    await queryInterface.addColumn("UserActivities", "longitude", {
      type: Sequelize.DECIMAL(10, 7),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("UserActivities", "longitude");
    await queryInterface.removeColumn("UserActivities", "latitude");
  },
};
