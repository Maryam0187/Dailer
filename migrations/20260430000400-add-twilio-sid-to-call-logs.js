"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CallLogs", "twilioSid", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });

    await queryInterface.addIndex("CallLogs", ["twilioSid"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("CallLogs", ["twilioSid"]);
    await queryInterface.removeColumn("CallLogs", "twilioSid");
  },
};
