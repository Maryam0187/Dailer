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

    if (!table.createdBy) {
      await queryInterface.addColumn("Users", "createdBy", {
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

    if (!(await hasIndex(queryInterface, "Users", ["createdBy"]))) {
      await queryInterface.addIndex("Users", ["createdBy"]);
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("Users");

    if (await hasIndex(queryInterface, "Users", ["createdBy"])) {
      await queryInterface.removeIndex("Users", ["createdBy"]);
    }

    if (table.createdBy) {
      await queryInterface.removeColumn("Users", "createdBy");
    }
  },
};
