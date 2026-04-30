"use strict";

module.exports = (sequelize, DataTypes) => {
  const Bill = sequelize.define(
    "Bill",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      fromDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      toDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING(8),
        allowNull: false,
        defaultValue: "USD",
      },
      twilioBaseAmount: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
      },
      fixedMarkupPerCall: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
      },
      markupAmount: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
      },
      totalCalls: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      totalAmount: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "generated",
      },
      pdfPath: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      generatedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },
    },
    {
      tableName: "Bills",
      timestamps: true,
    },
  );

  Bill.associate = (models) => {
    Bill.belongsTo(models.User, { as: "generatedByUser", foreignKey: "generatedBy" });
    Bill.hasMany(models.BillItem, { as: "items", foreignKey: "billId" });
  };

  return Bill;
};
