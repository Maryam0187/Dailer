"use strict";

/** Country of the customer. Existing customers stay USA unless their only leads are Canada. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Customers", "country", {
      type: Sequelize.ENUM("usa", "canada"),
      allowNull: false,
      defaultValue: "usa",
    });
    await queryInterface.addIndex("Customers", ["country"], { name: "customers_country" });
    await queryInterface.sequelize.query(`
      UPDATE \`Customers\` AS \`c\`
      SET \`c\`.\`country\` = 'canada'
      WHERE EXISTS (
        SELECT 1 FROM \`Leads\` AS \`l\`
        WHERE \`l\`.\`customerId\` = \`c\`.\`id\`
          AND \`l\`.\`country\` = 'canada'
      )
      AND NOT EXISTS (
        SELECT 1 FROM \`Leads\` AS \`l2\`
        WHERE \`l2\`.\`customerId\` = \`c\`.\`id\`
          AND \`l2\`.\`country\` = 'usa'
      )
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Customers", "customers_country");
    await queryInterface.removeColumn("Customers", "country");
  },
};
