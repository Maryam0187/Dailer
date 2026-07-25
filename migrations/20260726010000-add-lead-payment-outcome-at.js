"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "leadPaymentOutcomeAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex("Leads", ["leadPaymentOutcomeAt"]);

    // Backfill from latest payment outcome LeadUpdate (typed or legacy body).
    await queryInterface.sequelize.query(`
      UPDATE \`Leads\` l
      INNER JOIN (
        SELECT \`leadId\`, MAX(\`createdAt\`) AS \`outcomeAt\`
        FROM \`LeadUpdates\`
        WHERE \`type\` IN ('payment_charged', 'payment_declined', 'payment_chargeback')
           OR (
             \`type\` = 'lead_phase_change'
             AND (
               \`body\` LIKE 'Payment charged%'
               OR \`body\` LIKE 'Payment declined%'
               OR \`body\` LIKE 'Payment chargeback%'
             )
           )
        GROUP BY \`leadId\`
      ) u ON u.\`leadId\` = l.\`id\`
      SET l.\`leadPaymentOutcomeAt\` = u.\`outcomeAt\`
      WHERE l.\`leadPaymentChargeStatus\` IS NOT NULL
        AND l.\`leadPaymentOutcomeAt\` IS NULL
    `);

    // Fallback when status exists but no matching log.
    await queryInterface.sequelize.query(`
      UPDATE \`Leads\`
      SET \`leadPaymentOutcomeAt\` = \`updatedAt\`
      WHERE \`leadPaymentChargeStatus\` IS NOT NULL
        AND \`leadPaymentOutcomeAt\` IS NULL
    `);
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeIndex("Leads", ["leadPaymentOutcomeAt"]);
    } catch {
      // Index name may vary; column drop still proceeds.
    }
    await queryInterface.removeColumn("Leads", "leadPaymentOutcomeAt");
  },
};
