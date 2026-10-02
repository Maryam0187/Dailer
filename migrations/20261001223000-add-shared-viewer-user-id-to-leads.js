"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "sharedViewerUserId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addIndex("Leads", ["sharedViewerUserId"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Leads", ["sharedViewerUserId"]);
    await queryInterface.removeColumn("Leads", "sharedViewerUserId");
  },
};
