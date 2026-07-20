"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "importOwnerUserId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addIndex("Leads", ["importOwnerUserId"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Leads", ["importOwnerUserId"]);
    await queryInterface.removeColumn("Leads", "importOwnerUserId");
  },
};
