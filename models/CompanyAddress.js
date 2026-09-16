"use strict";

module.exports = (sequelize, DataTypes) => {
  const CompanyAddress = sequelize.define(
    "CompanyAddress",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      label: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      address: {
        type: DataTypes.STRING(1000),
        allowNull: false,
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
      },
    },
    {
      tableName: "CompanyAddresses",
      timestamps: true,
      indexes: [{ fields: ["sortOrder"] }],
    },
  );

  CompanyAddress.associate = (models) => {
    CompanyAddress.belongsTo(models.User, { as: "updatedByUser", foreignKey: "updatedBy" });
  };

  return CompanyAddress;
};
