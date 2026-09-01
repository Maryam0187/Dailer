"use strict";

module.exports = (sequelize, DataTypes) => {
  const MessageAttachment = sequelize.define(
    "MessageAttachment",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      conversationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Conversations", key: "id" },
      },
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Messages", key: "id" },
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      storageKey: {
        type: DataTypes.STRING(512),
        allowNull: false,
      },
      originalName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      mimeType: {
        type: DataTypes.STRING(127),
        allowNull: false,
      },
      sizeBytes: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("pending", "attached", "deleted"),
        allowNull: false,
        defaultValue: "pending",
      },
    },
    {
      tableName: "MessageAttachments",
      timestamps: true,
      indexes: [
        { fields: ["conversationId"] },
        { fields: ["messageId"] },
        { fields: ["userId", "status"] },
        { fields: ["status", "createdAt"] },
      ],
    },
  );

  MessageAttachment.associate = (models) => {
    MessageAttachment.belongsTo(models.Conversation, {
      foreignKey: "conversationId",
      as: "conversation",
    });
    MessageAttachment.belongsTo(models.Message, {
      foreignKey: "messageId",
      as: "message",
    });
    MessageAttachment.belongsTo(models.User, {
      foreignKey: "userId",
      as: "uploader",
    });
  };

  return MessageAttachment;
};
