"use strict";

module.exports = (sequelize, DataTypes) => {
  const Conversation = sequelize.define(
    "Conversation",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      dmUserLowId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      dmUserHighId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      lastMessageAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "Conversations",
      timestamps: true,
      indexes: [
        { unique: true, fields: ["dmUserLowId", "dmUserHighId"] },
        { fields: ["lastMessageAt"] },
      ],
    },
  );

  Conversation.associate = (models) => {
    Conversation.belongsTo(models.User, { foreignKey: "dmUserLowId", as: "dmUserLow" });
    Conversation.belongsTo(models.User, { foreignKey: "dmUserHighId", as: "dmUserHigh" });
    Conversation.hasMany(models.ConversationParticipant, {
      foreignKey: "conversationId",
      as: "participants",
    });
    Conversation.hasMany(models.Message, {
      foreignKey: "conversationId",
      as: "messages",
    });
  };

  return Conversation;
};
