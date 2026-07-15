"use strict";

/**
 * Track when verified / sale_done progress tags were added so admins can filter
 * customers by "tagged today / yesterday".
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "verifiedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("Leads", "saleDoneAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex("Leads", ["verifiedAt"]);
    await queryInterface.addIndex("Leads", ["saleDoneAt"]);

    // Best-effort backfill from progress activity logs (default English labels).
    await queryInterface.sequelize.query(`
      UPDATE \`Leads\` l
      INNER JOIN (
        SELECT \`leadId\`, MIN(\`createdAt\`) AS \`taggedAt\`
        FROM \`LeadUpdates\`
        WHERE \`type\` = 'lead_phase_change'
          AND \`body\` LIKE '%+Verified%'
        GROUP BY \`leadId\`
      ) u ON u.\`leadId\` = l.\`id\`
      SET l.\`verifiedAt\` = u.\`taggedAt\`
      WHERE JSON_CONTAINS(l.\`leadProgressTags\`, '"verified"')
        AND l.\`verifiedAt\` IS NULL
    `);

    await queryInterface.sequelize.query(`
      UPDATE \`Leads\` l
      INNER JOIN (
        SELECT \`leadId\`, MIN(\`createdAt\`) AS \`taggedAt\`
        FROM \`LeadUpdates\`
        WHERE \`type\` = 'lead_phase_change'
          AND \`body\` LIKE '%+Sale done%'
        GROUP BY \`leadId\`
      ) u ON u.\`leadId\` = l.\`id\`
      SET l.\`saleDoneAt\` = u.\`taggedAt\`
      WHERE JSON_CONTAINS(l.\`leadProgressTags\`, '"sale_done"')
        AND l.\`saleDoneAt\` IS NULL
    `);

    // Fallback for tagged leads with no matching activity row.
    await queryInterface.sequelize.query(`
      UPDATE \`Leads\`
      SET \`verifiedAt\` = \`updatedAt\`
      WHERE JSON_CONTAINS(\`leadProgressTags\`, '"verified"')
        AND \`verifiedAt\` IS NULL
    `);
    await queryInterface.sequelize.query(`
      UPDATE \`Leads\`
      SET \`saleDoneAt\` = \`updatedAt\`
      WHERE JSON_CONTAINS(\`leadProgressTags\`, '"sale_done"')
        AND \`saleDoneAt\` IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Leads", ["saleDoneAt"]).catch(() => {});
    await queryInterface.removeIndex("Leads", ["verifiedAt"]).catch(() => {});
    await queryInterface.removeColumn("Leads", "saleDoneAt");
    await queryInterface.removeColumn("Leads", "verifiedAt");
  },
};
