"use strict";

const SERVICE_VALUES = ["dish", "direct", "cable", "streams", "bell_tv", "shaw_direct"];

async function setServiceEnum(queryInterface, Sequelize, tableName) {
  await queryInterface.changeColumn(tableName, "serviceType", {
    type: Sequelize.ENUM(...SERVICE_VALUES),
    allowNull: true,
  });
}

/** Bell TV and Shaw Direct are Canada-only service values. USA values stay. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await setServiceEnum(queryInterface, Sequelize, "Leads");
    await setServiceEnum(queryInterface, Sequelize, "Customers");
  },

  async down(queryInterface, Sequelize) {
    const previous = ["dish", "direct", "cable", "streams"];
    await queryInterface.sequelize.query(
      "UPDATE Leads SET serviceType = NULL WHERE serviceType IN ('bell_tv', 'shaw_direct')",
    );
    await queryInterface.sequelize.query(
      "UPDATE Customers SET serviceType = NULL WHERE serviceType IN ('bell_tv', 'shaw_direct')",
    );
    await queryInterface.changeColumn("Leads", "serviceType", {
      type: Sequelize.ENUM(...previous),
      allowNull: true,
    });
    await queryInterface.changeColumn("Customers", "serviceType", {
      type: Sequelize.ENUM(...previous),
      allowNull: true,
    });
  },
};
