"use strict";

/** Country of the lead. Existing leads stay USA. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "country", {
      type: Sequelize.ENUM("usa", "canada"),
      allowNull: false,
      defaultValue: "usa",
    });
    await queryInterface.addIndex("Leads", ["country"], { name: "leads_country" });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Leads", "leads_country");
    await queryInterface.removeColumn("Leads", "country");
  },
};
