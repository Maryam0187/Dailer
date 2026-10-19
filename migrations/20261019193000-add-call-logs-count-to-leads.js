"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "callLogsCount", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    // Backfill from live CallLogs so existing leads keep accurate counts before any purge.
    await queryInterface.sequelize.query(`
      UPDATE Leads l
      LEFT JOIN (
        SELECT leadId, COUNT(*) AS cnt
        FROM CallLogs
        WHERE leadId IS NOT NULL
        GROUP BY leadId
      ) c ON c.leadId = l.id
      SET l.callLogsCount = COALESCE(c.cnt, 0)
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Leads", "callLogsCount");
  },
};
