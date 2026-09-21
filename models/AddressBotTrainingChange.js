"use strict";

module.exports = (sequelize, DataTypes) => {
  const AddressBotTrainingChange = sequelize.define(
    "AddressBotTrainingChange",
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
      tableName: "AddressBotTrainingChanges",
      timestamps: true,
      updatedAt: false,
    },
  );

  AddressBotTrainingChange.associate = (models) => {
    AddressBotTrainingChange.belongsTo(models.User, { as: "user", foreignKey: "userId" });
  };

  return AddressBotTrainingChange;
};
