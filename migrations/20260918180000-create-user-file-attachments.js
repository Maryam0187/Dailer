"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("UserFileAttachments", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      fileId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "UserFiles", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      storageKey: {
        type: Sequelize.STRING(512),
        allowNull: false,
      },
      originalName: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      mimeType: {
        type: Sequelize.STRING(127),
        allowNull: false,
      },
      sizeBytes: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM("pending", "attached", "deleted"),
        allowNull: false,
        defaultValue: "pending",
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("UserFileAttachments", ["fileId"]);
    await queryInterface.addIndex("UserFileAttachments", ["fileId", "status"]);
    await queryInterface.addIndex("UserFileAttachments", ["userId", "status"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("UserFileAttachments");
  },
};
