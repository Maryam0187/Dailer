"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE \`LeadUpdates\`
      SET \`type\` = 'payment_charged'
      WHERE \`type\` = 'lead_phase_change'
        AND \`body\` LIKE 'Payment charged%'
    `);
    await queryInterface.sequelize.query(`
      UPDATE \`LeadUpdates\`
      SET \`type\` = 'payment_declined'
      WHERE \`type\` = 'lead_phase_change'
        AND \`body\` LIKE 'Payment declined%'
    `);
    await queryInterface.sequelize.query(`
      UPDATE \`LeadUpdates\`
      SET \`type\` = 'payment_chargeback'
      WHERE \`type\` = 'lead_phase_change'
        AND \`body\` LIKE 'Payment chargeback%'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE \`LeadUpdates\`
      SET \`type\` = 'lead_phase_change'
      WHERE \`type\` IN ('payment_charged', 'payment_declined', 'payment_chargeback')
    `);
  },
};
