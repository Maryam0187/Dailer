"use strict";

async function hasIndex(queryInterface, tableName, fields) {
  const indexes = await queryInterface.showIndex(tableName);
  const key = fields.join(",");
  return indexes.some((idx) => {
    const cols = idx.fields?.map((f) => f.attribute).join(",") ?? "";
    return cols === key;
  });
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Users", "role", {
      type: Sequelize.ENUM("agent", "manager", "supervisor", "admin", "lead_monitor", "processor"),
      allowNull: false,
      defaultValue: "agent",
    });

    const leadsTable = await queryInterface.describeTable("Leads");
    if (!leadsTable.processorUserId) {
      await queryInterface.addColumn("Leads", "processorUserId", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }

    if (!(await hasIndex(queryInterface, "Leads", ["processorUserId"]))) {
      await queryInterface.addIndex("Leads", ["processorUserId"]);
    }
  },

  async down(queryInterface, Sequelize) {
    const leadsTable = await queryInterface.describeTable("Leads");

    if (await hasIndex(queryInterface, "Leads", ["processorUserId"])) {
      await queryInterface.removeIndex("Leads", ["processorUserId"]);
    }

    if (leadsTable.processorUserId) {
      await queryInterface.removeColumn("Leads", "processorUserId");
    }

    await queryInterface.sequelize.query(
      "UPDATE `Users` SET `role` = 'agent' WHERE `role` = 'processor'",
    );

    await queryInterface.changeColumn("Users", "role", {
      type: Sequelize.ENUM("agent", "manager", "supervisor", "admin", "lead_monitor"),
      allowNull: false,
      defaultValue: "agent",
    });
  },
};
