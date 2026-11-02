"use strict";

const SHARE_STATUS_SEEDS = [
  { category: "share", tagKey: "pending", fullLabel: "Pending", shortLabel: "Pnd", tone: "zinc", sortOrder: 10 },
  { category: "share", tagKey: "in_progress", fullLabel: "In progress", shortLabel: "IP", tone: "sky", sortOrder: 15 },
  { category: "share", tagKey: "cancelled", fullLabel: "Cancelled", shortLabel: "Cxl", tone: "red", sortOrder: 20 },
  { category: "share", tagKey: "no_contact", fullLabel: "No contact", shortLabel: "NC", tone: "amber", sortOrder: 30 },
  { category: "share", tagKey: "lead_created", fullLabel: "Lead created", shortLabel: "New", tone: "emerald", sortOrder: 40 },
];

/** Share-view tracking, separate from the sale's own lead phase. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "sharedViewerStatus", {
      type: Sequelize.ENUM("pending", "in_progress", "cancelled", "no_contact", "lead_created"),
      allowNull: true,
    });
    await queryInterface.addColumn("Leads", "sharedCreatedLeadId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Leads", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addColumn("Leads", "createdFromLeadId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Leads", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addColumn("Leads", "createdFromSharedViewerUserId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addIndex("Leads", ["sharedViewerStatus"], {
      name: "leads_shared_viewer_status",
    });
    await queryInterface.addIndex("Leads", ["createdFromLeadId"], {
      unique: true,
      name: "leads_created_from_lead_id_unique",
    });
    await queryInterface.addIndex("Leads", ["sharedCreatedLeadId"], {
      unique: true,
      name: "leads_shared_created_lead_id_unique",
    });

    await queryInterface.sequelize.query(`
      UPDATE \`Leads\`
      SET \`sharedViewerStatus\` = 'pending'
      WHERE \`sharedViewerUserId\` IS NOT NULL
        AND \`sharedViewerStatus\` IS NULL
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE \`WorkflowTags\`
      MODIFY COLUMN \`category\`
      ENUM('phase', 'progress', 'contact', 'payment', 'share')
      NOT NULL
    `);

    const now = new Date();
    for (const row of SHARE_STATUS_SEEDS) {
      const [existing] = await queryInterface.sequelize.query(
        "SELECT id FROM WorkflowTags WHERE category = :category AND tagKey = :tagKey LIMIT 1",
        { replacements: { category: row.category, tagKey: row.tagKey } },
      );
      if (existing.length > 0) continue;
      await queryInterface.bulkInsert("WorkflowTags", [
        {
          ...row,
          updatedByUserId: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("WorkflowTags", { category: "share" });
    await queryInterface.sequelize.query(`
      ALTER TABLE \`WorkflowTags\`
      MODIFY COLUMN \`category\`
      ENUM('phase', 'progress', 'contact', 'payment')
      NOT NULL
    `);
    await queryInterface.removeIndex("Leads", "leads_shared_created_lead_id_unique");
    await queryInterface.removeIndex("Leads", "leads_created_from_lead_id_unique");
    await queryInterface.removeIndex("Leads", "leads_shared_viewer_status");
    await queryInterface.removeColumn("Leads", "createdFromSharedViewerUserId");
    await queryInterface.removeColumn("Leads", "createdFromLeadId");
    await queryInterface.removeColumn("Leads", "sharedCreatedLeadId");
    await queryInterface.removeColumn("Leads", "sharedViewerStatus");
  },
};
