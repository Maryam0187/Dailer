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
    const table = await queryInterface.describeTable("Users");

    if (!table.supervisorId) {
      await queryInterface.addColumn("Users", "supervisorId", {
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

    if (!(await hasIndex(queryInterface, "Users", ["supervisorId"]))) {
      await queryInterface.addIndex("Users", ["supervisorId"]);
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("Users");

    if (await hasIndex(queryInterface, "Users", ["supervisorId"])) {
      await queryInterface.removeIndex("Users", ["supervisorId"]);
    }

    if (table.supervisorId) {
      await queryInterface.removeColumn("Users", "supervisorId");
    }
  },
};

