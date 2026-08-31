"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("MessageAttachments", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      conversationId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Conversations", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      messageId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Messages", key: "id" },
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

    await queryInterface.addIndex("MessageAttachments", ["conversationId"]);
    await queryInterface.addIndex("MessageAttachments", ["messageId"]);
    await queryInterface.addIndex("MessageAttachments", ["userId", "status"]);
    await queryInterface.addIndex("MessageAttachments", ["status", "createdAt"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("MessageAttachments");
  },
};
