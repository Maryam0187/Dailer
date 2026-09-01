"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex("UserActivities", ["userId", "action", "createdAt"], {
      name: "user_activities_user_action_created",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("UserActivities", "user_activities_user_action_created");
  },
};
