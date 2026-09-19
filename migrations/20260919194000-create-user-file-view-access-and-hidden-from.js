"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("UserFileViewAccess", {
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

    await queryInterface.addIndex("UserFileViewAccess", ["fileId"]);
    await queryInterface.addIndex("UserFileViewAccess", ["userId"]);
    await queryInterface.addIndex("UserFileViewAccess", ["fileId", "userId"], { unique: true });

    await queryInterface.createTable("UserFileHiddenFrom", {
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
      hiddenByUserId: {
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

    await queryInterface.addIndex("UserFileHiddenFrom", ["fileId"]);
    await queryInterface.addIndex("UserFileHiddenFrom", ["userId"]);
    await queryInterface.addIndex("UserFileHiddenFrom", ["fileId", "userId"], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("UserFileHiddenFrom");
    await queryInterface.dropTable("UserFileViewAccess");
  },
};
