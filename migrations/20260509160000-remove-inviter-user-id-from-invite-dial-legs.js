"use strict";

module.exports = {
  async up(queryInterface) {
    const table = await queryInterface.describeTable("InviteDialLegs");
    if (!table.inviterUserId) return;
    try {
      await queryInterface.removeIndex("InviteDialLegs", ["inviterUserId"]);
    } catch {
      // Index name may differ by DB version; column drop still applies below.
    }
    await queryInterface.removeColumn("InviteDialLegs", "inviterUserId");
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("InviteDialLegs");
    if (table.inviterUserId) return;
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
};
