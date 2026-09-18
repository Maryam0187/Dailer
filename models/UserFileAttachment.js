"use strict";

module.exports = (sequelize, DataTypes) => {
  const UserFileAttachment = sequelize.define(
    "UserFileAttachment",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      fileId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "UserFiles", key: "id" },
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
      tableName: "UserFileAttachments",
      timestamps: true,
      indexes: [
        { fields: ["fileId"] },
        { fields: ["fileId", "status"] },
        { fields: ["userId", "status"] },
      ],
    },
  );

  UserFileAttachment.associate = (models) => {
    UserFileAttachment.belongsTo(models.UserFile, {
      foreignKey: "fileId",
      as: "file",
    });
    UserFileAttachment.belongsTo(models.User, {
      foreignKey: "userId",
      as: "uploader",
    });
  };

  return UserFileAttachment;
};
