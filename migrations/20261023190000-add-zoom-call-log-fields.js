"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CallLogs", "voiceProvider", {
      type: Sequelize.STRING(16),
      allowNull: false,
      defaultValue: "twilio",
    });
    await queryInterface.addColumn("CallLogs", "externalCallId", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await queryInterface.addColumn("CallLogs", "externalCallLogId", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await queryInterface.addIndex("CallLogs", ["voiceProvider"]);
    await queryInterface.addIndex("CallLogs", ["userId", "externalCallId"], {
      name: "call_logs_user_external_call_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("CallLogs", "call_logs_user_external_call_id");
    await queryInterface.removeIndex("CallLogs", ["voiceProvider"]);
    await queryInterface.removeColumn("CallLogs", "externalCallLogId");
    await queryInterface.removeColumn("CallLogs", "externalCallId");
    await queryInterface.removeColumn("CallLogs", "voiceProvider");
  },
};
