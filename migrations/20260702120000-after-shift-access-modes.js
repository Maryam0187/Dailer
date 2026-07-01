"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "afterShiftAccess", {
      type: Sequelize.ENUM("none", "full", "limited"),
      allowNull: false,
      defaultValue: "none",
    });
    await queryInterface.addColumn("Users", "afterShiftLimitedFileId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "UserFiles", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.sequelize.query(
      "UPDATE `Users` SET `afterShiftAccess` = 'full' WHERE `afterShiftFullAccess` = true",
    );

    await queryInterface.removeColumn("Users", "afterShiftFullAccess");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "afterShiftFullAccess", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.sequelize.query(
      "UPDATE `Users` SET `afterShiftFullAccess` = true WHERE `afterShiftAccess` = 'full'",
    );

    await queryInterface.removeColumn("Users", "afterShiftLimitedFileId");
    await queryInterface.removeColumn("Users", "afterShiftAccess");
  },
};
