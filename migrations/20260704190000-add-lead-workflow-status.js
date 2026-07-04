"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "leadPhase", {
      type: Sequelize.ENUM("active", "closed", "cancelled"),
      allowNull: false,
      defaultValue: "active",
    });
    await queryInterface.addColumn("Leads", "leadProgressTags", {
      type: Sequelize.JSON,
      allowNull: false,
      defaultValue: [],
    });
    await queryInterface.addColumn("Leads", "leadProcessedRequired", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("Leads", "leadContactTag", {
      type: Sequelize.ENUM("voicemail", "hangup", "no_response", "appointment"),
      allowNull: true,
    });
    await queryInterface.addColumn("Leads", "leadContactCounts", {
      type: Sequelize.JSON,
      allowNull: false,
      defaultValue: {},
    });
    await queryInterface.addColumn("Leads", "leadAppointmentAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("Leads", "leadAppointmentNote", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn("Leads", "leadPaymentMethod", {
      type: Sequelize.ENUM("check_mail", "card", "pos_link"),
      allowNull: true,
    });
    await queryInterface.addColumn("Leads", "leadCancelReason", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addIndex("Leads", ["leadPhase"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Leads", ["leadPhase"]);
    await queryInterface.removeColumn("Leads", "leadCancelReason");
    await queryInterface.removeColumn("Leads", "leadPaymentMethod");
    await queryInterface.removeColumn("Leads", "leadAppointmentNote");
    await queryInterface.removeColumn("Leads", "leadAppointmentAt");
    await queryInterface.removeColumn("Leads", "leadContactCounts");
    await queryInterface.removeColumn("Leads", "leadContactTag");
    await queryInterface.removeColumn("Leads", "leadProcessedRequired");
    await queryInterface.removeColumn("Leads", "leadProgressTags");
    await queryInterface.removeColumn("Leads", "leadPhase");
  },
};
