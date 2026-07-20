"use strict";

module.exports = (sequelize, DataTypes) => {
  const ImportBatch = sequelize.define(
    "ImportBatch",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      createdByUserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      fileName: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      createdCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      skippedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      revertedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "ImportBatches",
      timestamps: true,
      indexes: [{ fields: ["createdAt"] }, { fields: ["createdByUserId"] }],
    },
  );

  ImportBatch.associate = (models) => {
    ImportBatch.belongsTo(models.User, { as: "createdBy", foreignKey: "createdByUserId" });
    ImportBatch.hasMany(models.Lead, { as: "leads", foreignKey: "importBatchId" });
  };

  return ImportBatch;
};
