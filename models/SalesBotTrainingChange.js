"use strict";

module.exports = (sequelize, DataTypes) => {
  const SalesBotTrainingChange = sequelize.define(
    "SalesBotTrainingChange",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
      },
      action: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      summary: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
    },
    {
      tableName: "SalesBotTrainingChanges",
      timestamps: true,
      updatedAt: false,
    },
  );

  SalesBotTrainingChange.associate = (models) => {
    SalesBotTrainingChange.belongsTo(models.User, { as: "user", foreignKey: "userId" });
  };

  return SalesBotTrainingChange;
};
