"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.renameColumn("Leads", "firstName", "fullName");
    await queryInterface.addColumn("Leads", "cellNumber", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.sequelize.query(`
      UPDATE Leads
      SET fullName = TRIM(CONCAT(fullName, ' ', lastName))
      WHERE lastName IS NOT NULL AND TRIM(lastName) != ''
    `);
    await queryInterface.removeColumn("Leads", "lastName");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("Leads", "lastName", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await queryInterface.renameColumn("Leads", "fullName", "firstName");
    await queryInterface.removeColumn("Leads", "cellNumber");
  },
};
