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
    },
    {
      tableName: "UserFiles",
      timestamps: true,
      indexes: [
        { fields: ["userId"] },
        { unique: true, fields: ["userId", "name"] },
      ],
    },
  );

  UserFile.associate = (models) => {
    UserFile.belongsTo(models.User, { as: "owner", foreignKey: "userId" });
  };

  return UserFile;
};
