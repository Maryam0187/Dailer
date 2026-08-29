"use strict";

/** Outside-customer sales use Leads with source=outside_sale (per-sale amount + card). */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Leads\`
      MODIFY COLUMN \`source\` ENUM('cold_dial', 'manual', 'legacy_import', 'outside_sale')
      NOT NULL DEFAULT 'manual'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE \`Leads\` SET \`source\` = 'manual' WHERE \`source\` = 'outside_sale'
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Leads\`
      MODIFY COLUMN \`source\` ENUM('cold_dial', 'manual', 'legacy_import')
      NOT NULL DEFAULT 'manual'
    `);
  },
};
