"use strict";

module.exports = (sequelize, DataTypes) => {
  const SalesBotProfile = sequelize.define(
    "SalesBotProfile",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: "Sales Assistant",
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
      tableName: "SalesBotProfiles",
      timestamps: true,
    },
  );

  SalesBotProfile.associate = (models) => {
    SalesBotProfile.belongsTo(models.User, { as: "updatedByUser", foreignKey: "updatedBy" });
  };

  return SalesBotProfile;
};
