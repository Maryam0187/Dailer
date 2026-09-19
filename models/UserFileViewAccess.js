"use strict";

module.exports = (sequelize, DataTypes) => {
  const UserFileViewAccess = sequelize.define(
    "UserFileViewAccess",
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
      tableName: "UserFileViewAccess",
      timestamps: true,
      indexes: [
        { fields: ["fileId"] },
        { fields: ["userId"] },
        { unique: true, fields: ["fileId", "userId"] },
      ],
    },
  );

  UserFileViewAccess.associate = (models) => {
    UserFileViewAccess.belongsTo(models.UserFile, { as: "file", foreignKey: "fileId" });
    UserFileViewAccess.belongsTo(models.User, { as: "user", foreignKey: "userId" });
    UserFileViewAccess.belongsTo(models.User, { as: "grantedBy", foreignKey: "grantedByUserId" });
  };

  return UserFileViewAccess;
};
