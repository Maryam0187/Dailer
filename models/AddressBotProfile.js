"use strict";

module.exports = (sequelize, DataTypes) => {
  const AddressBotProfile = sequelize.define(
    "AddressBotProfile",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: "Address Assistant",
      },
      instructions: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: "",
      },
      updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
      },
    },
    {
      tableName: "AddressBotProfiles",
      timestamps: true,
    },
  );

  AddressBotProfile.associate = (models) => {
    AddressBotProfile.belongsTo(models.User, { as: "updatedByUser", foreignKey: "updatedBy" });
  };

  return AddressBotProfile;
};
