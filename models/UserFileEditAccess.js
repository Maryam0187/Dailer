"use strict";

module.exports = (sequelize, DataTypes) => {
  const UserFileEditAccess = sequelize.define(
    "UserFileEditAccess",
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
      grantedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
    },
    {
      tableName: "UserFileEditAccess",
      timestamps: true,
      indexes: [
        { fields: ["fileId"] },
        { fields: ["userId"] },
        { unique: true, fields: ["fileId", "userId"] },
      ],
    },
  );

  UserFileEditAccess.associate = (models) => {
    UserFileEditAccess.belongsTo(models.UserFile, { as: "file", foreignKey: "fileId" });
    UserFileEditAccess.belongsTo(models.User, { as: "user", foreignKey: "userId" });
    UserFileEditAccess.belongsTo(models.User, { as: "grantedBy", foreignKey: "grantedByUserId" });
  };

  return UserFileEditAccess;
};
