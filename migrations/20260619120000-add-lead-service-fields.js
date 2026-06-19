"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "serviceType", {
      type: Sequelize.ENUM("dish", "direct", "cable", "streams"),
      allowNull: true,
    });
    await queryInterface.addColumn("Leads", "cableName", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await queryInterface.addColumn("Leads", "streamName", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Leads", "streamName");
    await queryInterface.removeColumn("Leads", "cableName");
    await queryInterface.removeColumn("Leads", "serviceType");
  },
};
