"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("UserFiles", "sharedWithAll", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addIndex("UserFiles", ["sharedWithAll"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("UserFiles", ["sharedWithAll"]);
    await queryInterface.removeColumn("UserFiles", "sharedWithAll");
  },
};
