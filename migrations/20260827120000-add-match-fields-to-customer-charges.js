"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CustomerCharges", "leadId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Leads", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
      after: "customerId",
    });
    await queryInterface.addColumn("CustomerCharges", "cardLast4", {
      type: Sequelize.STRING(4),
      allowNull: true,
      after: "processor",
    });
    await queryInterface.addColumn("CustomerCharges", "cardBrand", {
      type: Sequelize.STRING(32),
      allowNull: true,
      after: "cardLast4",
    });
    await queryInterface.addColumn("CustomerCharges", "authCode", {
      type: Sequelize.STRING(64),
      allowNull: true,
      after: "cardBrand",
    });
    await queryInterface.addColumn("CustomerCharges", "arn", {
      type: Sequelize.STRING(128),
      allowNull: true,
      after: "authCode",
    });
    await queryInterface.addColumn("CustomerCharges", "processorTransactionId", {
      type: Sequelize.STRING(128),
      allowNull: true,
      after: "arn",
    });

    await queryInterface.addIndex("CustomerCharges", ["leadId"], {
      name: "customer_charges_lead_id",
    });
    await queryInterface.addIndex("CustomerCharges", ["cardLast4"], {
      name: "customer_charges_card_last4",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("CustomerCharges", "customer_charges_card_last4");
    await queryInterface.removeIndex("CustomerCharges", "customer_charges_lead_id");
    await queryInterface.removeColumn("CustomerCharges", "processorTransactionId");
    await queryInterface.removeColumn("CustomerCharges", "arn");
    await queryInterface.removeColumn("CustomerCharges", "authCode");
    await queryInterface.removeColumn("CustomerCharges", "cardBrand");
    await queryInterface.removeColumn("CustomerCharges", "cardLast4");
    await queryInterface.removeColumn("CustomerCharges", "leadId");
  },
};
