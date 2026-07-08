"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Leads", "leadPaymentMethod", {
      type: Sequelize.ENUM("check_mail", "e_check", "card", "pos_link"),
      allowNull: true,
    });

    const [rows] = await queryInterface.sequelize.query(
      "SELECT id FROM WorkflowTags WHERE category = 'payment' AND tagKey = 'e_check' LIMIT 1",
    );
    if (rows.length === 0) {
      const now = new Date();
      await queryInterface.bulkInsert("WorkflowTags", [
        {
          category: "payment",
          tagKey: "e_check",
          fullLabel: "E-check",
          shortLabel: "ECK",
          tone: "yellow",
          sortOrder: 15,
          updatedByUserId: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    } else {
      await queryInterface.sequelize.query(
        "UPDATE WorkflowTags SET tone = 'yellow', updatedAt = NOW() WHERE category = 'payment' AND tagKey = 'e_check'",
      );
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "UPDATE Leads SET leadPaymentMethod = NULL WHERE leadPaymentMethod = 'e_check'",
    );
    await queryInterface.bulkDelete("WorkflowTags", { category: "payment", tagKey: "e_check" });
    await queryInterface.changeColumn("Leads", "leadPaymentMethod", {
      type: Sequelize.ENUM("check_mail", "card", "pos_link"),
      allowNull: true,
    });
  },
};
