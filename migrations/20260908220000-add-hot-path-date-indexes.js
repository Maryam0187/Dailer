"use strict";

/** Additive indexes for hot list/metrics date filters. Safe to run on live DB. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex("CallLogs", ["createdAt"], {
      name: "call_logs_created_at",
    });
    await queryInterface.addIndex("CallLogs", ["userId", "createdAt"], {
      name: "call_logs_user_created_at",
    });
    await queryInterface.addIndex("Leads", ["createdAt"], {
      name: "leads_created_at",
    });
    await queryInterface.addIndex("Leads", ["updatedAt"], {
      name: "leads_updated_at",
    });
    await queryInterface.addIndex("LeadUpdates", ["type", "createdAt"], {
      name: "lead_updates_type_created_at",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("LeadUpdates", "lead_updates_type_created_at");
    await queryInterface.removeIndex("Leads", "leads_updated_at");
    await queryInterface.removeIndex("Leads", "leads_created_at");
    await queryInterface.removeIndex("CallLogs", "call_logs_user_created_at");
    await queryInterface.removeIndex("CallLogs", "call_logs_created_at");
  },
};
