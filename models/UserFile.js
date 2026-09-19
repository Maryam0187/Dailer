"use strict";

module.exports = (sequelize, DataTypes) => {
  const UserFile = sequelize.define(
    "UserFile",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      content: {
        type: DataTypes.TEXT("long"),
        allowNull: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      sharedWithAll: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      preventCopy: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: "UserFiles",
      timestamps: true,
      defaultScope: {
        where: { deleted: false },
      },
      indexes: [
        { fields: ["userId"] },
        { fields: ["userId", "name"] },
        { fields: ["userId", "deleted"] },
      ],
    },
  );

  UserFile.associate = (models) => {
    UserFile.belongsTo(models.User, { as: "owner", foreignKey: "userId" });
    UserFile.hasMany(models.UserFileEditAccess, { as: "editAccessGrants", foreignKey: "fileId" });
    UserFile.hasMany(models.UserFileViewAccess, { as: "viewAccessGrants", foreignKey: "fileId" });
    UserFile.hasMany(models.UserFileHiddenFrom, { as: "hiddenFrom", foreignKey: "fileId" });
    UserFile.hasMany(models.UserFileAttachment, { as: "attachments", foreignKey: "fileId" });
  };

  return UserFile;
};
