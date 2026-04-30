"use strict";

module.exports = (sequelize, DataTypes) => {
  const BillItem = sequelize.define(
    "BillItem",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      billId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Bills",
          key: "id",
        },
      },
      callLogId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "CallLogs",
          key: "id",
        },
      },
      twilioSid: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      toNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      fromNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      durationSeconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      twilioCost: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
      },
      markupApplied: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
      },
      lineAmount: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
      },
    },
    {
      tableName: "BillItems",
      timestamps: true,
    },
  );

  BillItem.associate = (models) => {
    BillItem.belongsTo(models.Bill, { as: "bill", foreignKey: "billId" });
    BillItem.belongsTo(models.CallLog, { as: "callLog", foreignKey: "callLogId" });
  };

  return BillItem;
};
