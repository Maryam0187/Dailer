"use strict";

module.exports = (sequelize, DataTypes) => {
  const TwilioPhoneNumber = sequelize.define(
    "TwilioPhoneNumber",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      phoneNumber: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
      },
      /** `main` = primary TWILIO_* account; `team` = manager subaccount. */
      accountKind: {
        type: DataTypes.ENUM("main", "team"),
        allowNull: false,
        defaultValue: "main",
      },
      /** Set when accountKind is `team` (manager who owns the subaccount). */
      managerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Users",
          key: "id",
        },
      },
      twilioSid: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      friendlyName: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      label: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
    },
    {
      tableName: "TwilioPhoneNumbers",
      timestamps: true,
      indexes: [
        { unique: true, fields: ["phoneNumber"] },
        { fields: ["accountKind", "managerId"] },
      ],
    },
  );

  TwilioPhoneNumber.associate = (models) => {
    TwilioPhoneNumber.belongsTo(models.User, {
      as: "manager",
      foreignKey: "managerId",
    });
    TwilioPhoneNumber.belongsTo(models.ManagerTwilioAccount, {
      as: "managerTwilioAccount",
      foreignKey: "managerId",
      targetKey: "managerId",
      constraints: false,
    });
  };

  return TwilioPhoneNumber;
};
