"use strict";

/**
 * Track when the processed progress tag was added (for Tagged today/yesterday filters).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "processedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex("Leads", ["processedAt"]);

    await queryInterface.sequelize.query(`
      UPDATE \`Leads\` l
      INNER JOIN (
        SELECT \`leadId\`, MIN(\`createdAt\`) AS \`taggedAt\`
        FROM \`LeadUpdates\`
        WHERE \`type\` = 'lead_phase_change'
          AND \`body\` LIKE '%+Processed%'
        GROUP BY \`leadId\`
      ) u ON u.\`leadId\` = l.\`id\`
      SET l.\`processedAt\` = u.\`taggedAt\`
      WHERE JSON_CONTAINS(l.\`leadProgressTags\`, '"processed"')
        AND l.\`processedAt\` IS NULL
    `);

    await queryInterface.sequelize.query(`
      UPDATE \`Leads\`
      SET \`processedAt\` = \`updatedAt\`
      WHERE JSON_CONTAINS(\`leadProgressTags\`, '"processed"')
        AND \`processedAt\` IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Leads", ["processedAt"]).catch(() => {});
    await queryInterface.removeColumn("Leads", "processedAt");
  },
};
