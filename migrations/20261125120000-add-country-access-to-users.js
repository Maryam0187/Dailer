"use strict";

/** Which countries a user may work. Existing accounts stay on the USA campaign. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "countryAccess", {
      type: Sequelize.ENUM("usa", "canada", "both"),
      allowNull: false,
      defaultValue: "usa",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Users", "countryAccess");
  },
};
