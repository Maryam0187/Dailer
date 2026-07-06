"use strict";

module.exports = (sequelize, DataTypes) => {
  const WorkflowTag = sequelize.define(
    "WorkflowTag",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      category: {
        type: DataTypes.ENUM("phase", "progress", "contact", "payment"),
        allowNull: false,
      },
      tagKey: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      fullLabel: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      shortLabel: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      tone: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "zinc",
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      updatedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
      },
    },
    {
      tableName: "WorkflowTags",
      timestamps: true,
      indexes: [{ unique: true, fields: ["category", "tagKey"] }],
    },
  );

  WorkflowTag.associate = (models) => {
    WorkflowTag.belongsTo(models.User, { as: "updatedBy", foreignKey: "updatedByUserId" });
  };

  return WorkflowTag;
};
