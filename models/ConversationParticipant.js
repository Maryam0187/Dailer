"use strict";

module.exports = (sequelize, DataTypes) => {
  const ConversationParticipant = sequelize.define(
    "ConversationParticipant",
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
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      lastReadAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "ConversationParticipants",
      timestamps: true,
      indexes: [
        { unique: true, fields: ["conversationId", "userId"] },
        { fields: ["userId"] },
      ],
    },
  );

  ConversationParticipant.associate = (models) => {
    ConversationParticipant.belongsTo(models.Conversation, {
      foreignKey: "conversationId",
      as: "conversation",
    });
    ConversationParticipant.belongsTo(models.User, {
      foreignKey: "userId",
      as: "user",
    });
  };

  return ConversationParticipant;
};
