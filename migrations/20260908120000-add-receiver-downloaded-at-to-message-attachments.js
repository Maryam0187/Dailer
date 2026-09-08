"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("MessageAttachments", "receiverDownloadedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex("MessageAttachments", ["receiverDownloadedAt"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("MessageAttachments", ["receiverDownloadedAt"]);
    await queryInterface.removeColumn("MessageAttachments", "receiverDownloadedAt");
  },
};
