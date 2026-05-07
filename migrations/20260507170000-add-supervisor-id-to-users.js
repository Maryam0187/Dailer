"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "supervisorId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addIndex("Users", ["supervisorId"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Users", ["supervisorId"]);
    await queryInterface.removeColumn("Users", "supervisorId");
  },
};

