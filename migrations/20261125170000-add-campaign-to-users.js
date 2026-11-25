"use strict";

/** Which sale a user works. Existing accounts stay on the TV campaign. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "campaign", {
      type: Sequelize.ENUM("tv", "software"),
      allowNull: false,
      defaultValue: "tv",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Users", "campaign");
  },
};
