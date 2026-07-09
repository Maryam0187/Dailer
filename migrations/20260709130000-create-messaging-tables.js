"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Conversations", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      dmUserLowId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      dmUserHighId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      lastMessageAt: {
        type: Sequelize.DATE,
        allowNull: true,
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

    await queryInterface.addIndex("Conversations", ["dmUserLowId", "dmUserHighId"], {
      unique: true,
      name: "conversations_dm_pair_unique",
    });
    await queryInterface.addIndex("Conversations", ["lastMessageAt"]);

    await queryInterface.createTable("ConversationParticipants", {
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
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      lastReadAt: {
        type: Sequelize.DATE,
        allowNull: true,
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

    await queryInterface.addIndex("ConversationParticipants", ["conversationId", "userId"], {
      unique: true,
      name: "conversation_participants_unique",
    });
    await queryInterface.addIndex("ConversationParticipants", ["userId"]);

    await queryInterface.createTable("Messages", {
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
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false,
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

    await queryInterface.addIndex("Messages", ["conversationId", "id"]);
    await queryInterface.addIndex("Messages", ["userId"]);
    await queryInterface.addIndex("Messages", ["createdAt"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Messages");
    await queryInterface.dropTable("ConversationParticipants");
    await queryInterface.dropTable("Conversations");
  },
};
