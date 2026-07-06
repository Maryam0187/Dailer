"use strict";

const WORKFLOW_TAG_SEEDS = [
  { category: "phase", tagKey: "active", fullLabel: "Active", shortLabel: "Act", tone: "emerald", sortOrder: 10 },
  { category: "phase", tagKey: "closed", fullLabel: "Sale close", shortLabel: "SC", tone: "zinc", sortOrder: 20 },
  { category: "phase", tagKey: "cancelled", fullLabel: "Cancelled", shortLabel: "Can", tone: "red", sortOrder: 30 },
  { category: "progress", tagKey: "verified", fullLabel: "Verified", shortLabel: "V", tone: "blue", sortOrder: 10 },
  { category: "progress", tagKey: "processed", fullLabel: "Processed", shortLabel: "P", tone: "violet", sortOrder: 20 },
  { category: "progress", tagKey: "sale_done", fullLabel: "Sale done", shortLabel: "sd", tone: "emerald", sortOrder: 30 },
  { category: "contact", tagKey: "voicemail", fullLabel: "Voicemail", shortLabel: "VM", tone: "amber", sortOrder: 10 },
  { category: "contact", tagKey: "hangup", fullLabel: "Hangup", shortLabel: "HU", tone: "red", sortOrder: 20 },
  { category: "contact", tagKey: "no_response", fullLabel: "No response", shortLabel: "NR", tone: "zinc", sortOrder: 30 },
  { category: "contact", tagKey: "appointment", fullLabel: "Appointment", shortLabel: "Appt", tone: "sky", sortOrder: 40 },
  { category: "payment", tagKey: "check_mail", fullLabel: "Check mail", shortLabel: "CK", tone: "emerald", sortOrder: 10 },
  { category: "payment", tagKey: "card", fullLabel: "Card", shortLabel: "Card", tone: "blue", sortOrder: 20 },
  { category: "payment", tagKey: "pos_link", fullLabel: "POS Link", shortLabel: "POS", tone: "violet", sortOrder: 30 },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("WorkflowTags", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      category: {
        type: Sequelize.ENUM("phase", "progress", "contact", "payment"),
        allowNull: false,
      },
      tagKey: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      fullLabel: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      shortLabel: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      tone: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "zinc",
      },
      sortOrder: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      updatedByUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("WorkflowTags", ["category", "tagKey"], {
      unique: true,
      name: "workflow_tags_category_tag_key",
    });

    const now = new Date();
    await queryInterface.bulkInsert(
      "WorkflowTags",
      WORKFLOW_TAG_SEEDS.map((row) => ({
        ...row,
        updatedByUserId: null,
        createdAt: now,
        updatedAt: now,
      })),
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("WorkflowTags");
  },
};
