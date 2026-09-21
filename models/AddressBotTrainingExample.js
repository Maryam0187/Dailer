"use strict";

module.exports = (sequelize, DataTypes) => {
  const AddressBotTrainingExample = sequelize.define(
    "AddressBotTrainingExample",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      question: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      answer: {
        type: DataTypes.STRING(1000),
        allowNull: false,
      },
      updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
      },
    },
    {
      tableName: "AddressBotTrainingExamples",
      timestamps: true,
    },
  );

  AddressBotTrainingExample.associate = (models) => {
    AddressBotTrainingExample.belongsTo(models.User, { as: "updatedByUser", foreignKey: "updatedBy" });
  };

  return AddressBotTrainingExample;
};
