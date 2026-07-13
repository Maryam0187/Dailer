"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Customers", "fullName", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });

    // Backfill from latest lead per customer
    await queryInterface.sequelize.query(`
      UPDATE \`Customers\` c
      INNER JOIN (
        SELECT l.\`customerId\`, l.\`fullName\`
        FROM \`Leads\` l
        INNER JOIN (
          SELECT \`customerId\`, MAX(\`id\`) AS \`maxId\`
          FROM \`Leads\`
          WHERE \`customerId\` IS NOT NULL
          GROUP BY \`customerId\`
        ) latest ON l.\`id\` = latest.\`maxId\`
      ) src ON src.\`customerId\` = c.\`id\`
      SET c.\`fullName\` = src.\`fullName\`
      WHERE c.\`fullName\` IS NULL OR c.\`fullName\` = ''
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Customers", "fullName");
  },
};
