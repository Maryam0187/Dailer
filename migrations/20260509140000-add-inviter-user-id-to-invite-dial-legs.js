"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("InviteDialLegs", "inviterUserId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addIndex("InviteDialLegs", ["inviterUserId"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("InviteDialLegs", ["inviterUserId"]);
    await queryInterface.removeColumn("InviteDialLegs", "inviterUserId");
  },
};
