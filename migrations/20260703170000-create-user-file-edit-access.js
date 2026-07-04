"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("UserFileEditAccess", {
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
      grantedByUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
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

    await queryInterface.addIndex("UserFileEditAccess", ["fileId"]);
    await queryInterface.addIndex("UserFileEditAccess", ["userId"]);
    await queryInterface.addIndex("UserFileEditAccess", ["fileId", "userId"], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("UserFileEditAccess");
  },
};
