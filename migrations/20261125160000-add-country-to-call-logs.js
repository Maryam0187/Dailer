"use strict";

/** Country of the call. Existing logs stay USA unless they belong to a Canada lead. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CallLogs", "country", {
      type: Sequelize.ENUM("usa", "canada"),
      allowNull: false,
      defaultValue: "usa",
    });
    await queryInterface.addIndex("CallLogs", ["country"], { name: "call_logs_country" });
    await queryInterface.sequelize.query(`
      UPDATE \`CallLogs\` AS \`c\`
      INNER JOIN \`Leads\` AS \`l\` ON \`l\`.\`id\` = \`c\`.\`leadId\`
      SET \`c\`.\`country\` = \`l\`.\`country\`
      WHERE \`l\`.\`country\` = 'canada'
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("CallLogs", "call_logs_country");
    await queryInterface.removeColumn("CallLogs", "country");
  },
};
