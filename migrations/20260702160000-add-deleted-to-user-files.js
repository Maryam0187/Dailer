"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("UserFiles", "deleted", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.removeIndex("UserFiles", ["userId", "name"]);
    await queryInterface.addIndex("UserFiles", ["userId", "name"]);
    await queryInterface.addIndex("UserFiles", ["userId", "deleted"]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex("UserFiles", ["userId", "deleted"]);
    await queryInterface.removeIndex("UserFiles", ["userId", "name"]);
    await queryInterface.addIndex("UserFiles", ["userId", "name"], { unique: true });
    await queryInterface.removeColumn("UserFiles", "deleted");
  },
};
