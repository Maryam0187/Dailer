"use strict";

module.exports = (sequelize, DataTypes) => {
  const UserFileHiddenFrom = sequelize.define(
    "UserFileHiddenFrom",
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
      hiddenByUserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
    },
    {
      tableName: "UserFileHiddenFrom",
      timestamps: true,
      indexes: [
        { fields: ["fileId"] },
        { fields: ["userId"] },
        { unique: true, fields: ["fileId", "userId"] },
      ],
    },
  );

  UserFileHiddenFrom.associate = (models) => {
    UserFileHiddenFrom.belongsTo(models.UserFile, { as: "file", foreignKey: "fileId" });
    UserFileHiddenFrom.belongsTo(models.User, { as: "user", foreignKey: "userId" });
    UserFileHiddenFrom.belongsTo(models.User, { as: "hiddenBy", foreignKey: "hiddenByUserId" });
  };

  return UserFileHiddenFrom;
};
