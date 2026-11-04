"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("SalesBotProfiles", "botKey", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });

    const [profiles] = await queryInterface.sequelize.query(
      "SELECT id FROM SalesBotProfiles ORDER BY id ASC",
    );
    const now = new Date();
    if (!profiles.length) {
      await queryInterface.bulkInsert("SalesBotProfiles", [
        {
          name: "Sales Assistant",
          instructions: "",
          botKey: "primary",
          updatedBy: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          name: "Sales Bot 2",
          instructions: "",
          botKey: "secondary",
          updatedBy: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    } else {
      await queryInterface.sequelize.query("UPDATE SalesBotProfiles SET botKey = ? WHERE id = ?", {
        replacements: ["primary", profiles[0].id],
      });
      for (const row of profiles.slice(1)) {
        await queryInterface.sequelize.query(
          "UPDATE SalesBotProfiles SET botKey = ? WHERE id = ? AND (botKey IS NULL OR botKey = '')",
          { replacements: [`extra-${row.id}`.slice(0, 32), row.id] },
        );
      }
      const [secondary] = await queryInterface.sequelize.query(
        "SELECT id FROM SalesBotProfiles WHERE botKey = 'secondary' LIMIT 1",
      );
      if (!secondary.length) {
        await queryInterface.bulkInsert("SalesBotProfiles", [
          {
            name: "Sales Bot 2",
            instructions: "",
            botKey: "secondary",
            updatedBy: null,
            createdAt: now,
            updatedAt: now,
          },
        ]);
      }
    }

    await queryInterface.changeColumn("SalesBotProfiles", "botKey", {
      type: Sequelize.STRING(32),
      allowNull: false,
    });
    await queryInterface.addIndex("SalesBotProfiles", ["botKey"], {
      unique: true,
      name: "sales_bot_profiles_bot_key_unique",
    });

    await queryInterface.addColumn("SalesBotTrainingExamples", "botKey", {
      type: Sequelize.STRING(32),
      allowNull: false,
      defaultValue: "primary",
    });
    await queryInterface.addIndex("SalesBotTrainingExamples", ["botKey"], {
      name: "sales_bot_examples_bot_key",
    });

    await queryInterface.addColumn("SalesBotTrainingChanges", "botKey", {
      type: Sequelize.STRING(32),
      allowNull: false,
      defaultValue: "primary",
    });
    await queryInterface.addIndex("SalesBotTrainingChanges", ["botKey"], {
      name: "sales_bot_changes_bot_key",
    });

    await queryInterface.addColumn("CallLogs", "salesBotKey", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addIndex("CallLogs", ["salesBotKey"], {
      name: "call_logs_sales_bot_key",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("CallLogs", "call_logs_sales_bot_key");
    await queryInterface.removeColumn("CallLogs", "salesBotKey");

    await queryInterface.bulkDelete("SalesBotTrainingExamples", { botKey: "secondary" });
    await queryInterface.bulkDelete("SalesBotTrainingChanges", { botKey: "secondary" });
    await queryInterface.removeIndex("SalesBotTrainingExamples", "sales_bot_examples_bot_key");
    await queryInterface.removeColumn("SalesBotTrainingExamples", "botKey");
    await queryInterface.removeIndex("SalesBotTrainingChanges", "sales_bot_changes_bot_key");
    await queryInterface.removeColumn("SalesBotTrainingChanges", "botKey");

    await queryInterface.bulkDelete("SalesBotProfiles", { botKey: "secondary" });
    await queryInterface.removeIndex("SalesBotProfiles", "sales_bot_profiles_bot_key_unique");
    await queryInterface.removeColumn("SalesBotProfiles", "botKey");
  },
};
