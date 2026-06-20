"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("UserActivities", "country", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn("UserActivities", "region", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await queryInterface.addColumn("UserActivities", "city", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("UserActivities", "city");
    await queryInterface.removeColumn("UserActivities", "region");
    await queryInterface.removeColumn("UserActivities", "country");
  },
};
