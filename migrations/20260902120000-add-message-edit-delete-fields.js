"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Messages", "editedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("Messages", "deletedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex("Messages", ["deletedAt"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Messages", ["deletedAt"]);
    await queryInterface.removeColumn("Messages", "deletedAt");
    await queryInterface.removeColumn("Messages", "editedAt");
  },
};
