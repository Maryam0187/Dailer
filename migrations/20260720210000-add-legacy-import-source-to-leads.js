"use strict";

/** Extend Leads.source ENUM with legacy_import for CSV/admin imports. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Leads\`
      MODIFY COLUMN \`source\` ENUM('cold_dial', 'manual', 'legacy_import')
      NOT NULL DEFAULT 'manual'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE \`Leads\` SET \`source\` = 'manual' WHERE \`source\` = 'legacy_import'
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Leads\`
      MODIFY COLUMN \`source\` ENUM('cold_dial', 'manual')
      NOT NULL DEFAULT 'manual'
    `);
  },
};
