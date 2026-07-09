"use strict";

module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define(
    "Message",
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
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      tableName: "Messages",
      timestamps: true,
      indexes: [
        { fields: ["conversationId", "id"] },
        { fields: ["userId"] },
        { fields: ["createdAt"] },
      ],
    },
  );

  Message.associate = (models) => {
    Message.belongsTo(models.Conversation, {
      foreignKey: "conversationId",
      as: "conversation",
    });
    Message.belongsTo(models.User, {
      foreignKey: "userId",
      as: "author",
    });
  };

  return Message;
};
