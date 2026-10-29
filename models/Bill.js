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
      /** Percent applied to Programmable Voice when this bill was generated. */
      programmableVoiceMarkupPercent: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 0,
      },
      programmableVoiceMarkupAmount: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
        defaultValue: 0,
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
      /** Storage key (S3/local attachment bucket) or legacy filesystem path. */
      pdfPath: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      /** Category costs: Client, Programmable Voice, Recording, Phone Numbers. */
      usageBreakdown: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      /** Per-user call metrics included on the invoice. */
      userRecords: {
        type: DataTypes.JSON,
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
      /** When set, bill is for that manager's Twilio subaccount team. */
      managerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
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
    Bill.belongsTo(models.User, { as: "teamManager", foreignKey: "managerId" });
    Bill.hasMany(models.BillItem, { as: "items", foreignKey: "billId" });
  };

  return Bill;
};
