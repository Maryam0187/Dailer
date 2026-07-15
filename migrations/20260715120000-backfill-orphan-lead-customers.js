"use strict";

/**
 * Create Customer rows for leads that were never linked (customerId IS NULL),
 * then attach those leads. Safe to re-run: only inserts phones missing from Customers.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO \`Customers\`
        (\`phone\`, \`fullName\`, \`city\`, \`state\`, \`zipCode\`, \`serviceType\`, \`cableName\`, \`streamName\`, \`createdAt\`, \`updatedAt\`)
      SELECT
        l.\`phone\`,
        l.\`fullName\`,
        l.\`city\`,
        l.\`state\`,
        l.\`zipCode\`,
        l.\`serviceType\`,
        l.\`cableName\`,
        l.\`streamName\`,
        UTC_TIMESTAMP(),
        UTC_TIMESTAMP()
      FROM \`Leads\` l
      INNER JOIN (
        SELECT \`phone\`, MAX(\`id\`) AS \`maxId\`
        FROM \`Leads\`
        WHERE \`customerId\` IS NULL
          AND \`phone\` IS NOT NULL
          AND \`phone\` != ''
        GROUP BY \`phone\`
      ) latest ON l.\`id\` = latest.\`maxId\`
      LEFT JOIN \`Customers\` c ON c.\`phone\` = l.\`phone\`
      WHERE c.\`id\` IS NULL
    `);

    await queryInterface.sequelize.query(`
      UPDATE \`Leads\` l
      INNER JOIN \`Customers\` c ON c.\`phone\` = l.\`phone\`
      SET l.\`customerId\` = c.\`id\`
      WHERE l.\`customerId\` IS NULL
    `);
  },

  async down() {
    // Irreversible data backfill — leave customers/links in place.
  },
};
