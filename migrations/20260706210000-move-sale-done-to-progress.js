"use strict";

module.exports = {
  async up(queryInterface) {
    const [workflowTagRows] = await queryInterface.sequelize.query(
      "SELECT id FROM WorkflowTags WHERE category = 'contact' AND tagKey = 'sale_done' LIMIT 1",
    );
    if (workflowTagRows.length > 0) {
      await queryInterface.bulkDelete("WorkflowTags", { category: "contact", tagKey: "sale_done" });
      const now = new Date();
      await queryInterface.bulkInsert("WorkflowTags", [
        {
          category: "progress",
          tagKey: "sale_done",
          fullLabel: "Sale done",
          shortLabel: "sd",
          tone: "emerald",
          sortOrder: 30,
          updatedByUserId: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }

    const [leads] = await queryInterface.sequelize.query(
      "SELECT id, leadProgressTags FROM Leads WHERE leadContactTag = 'sale_done'",
    );
    for (const lead of leads) {
      let tags = [];
      try {
        tags = Array.isArray(lead.leadProgressTags)
          ? lead.leadProgressTags
          : JSON.parse(lead.leadProgressTags || "[]");
      } catch {
        tags = [];
      }
      if (!tags.includes("sale_done")) tags.push("sale_done");
      await queryInterface.sequelize.query(
        "UPDATE Leads SET leadContactTag = NULL, leadProgressTags = :tags WHERE id = :id",
        { replacements: { id: lead.id, tags: JSON.stringify(tags) } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("WorkflowTags", { category: "progress", tagKey: "sale_done" });
    const now = new Date();
    await queryInterface.bulkInsert("WorkflowTags", [
      {
        category: "contact",
        tagKey: "sale_done",
        fullLabel: "Sale done",
        shortLabel: "sd",
        tone: "emerald",
        sortOrder: 50,
        updatedByUserId: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  },
};
