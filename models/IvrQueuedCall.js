"use strict";

module.exports = (sequelize, DataTypes) => {
  const IvrQueuedCall = sequelize.define(
    "IvrQueuedCall",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      callSid: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      conferenceName: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      fromNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      toNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      choice: {
        type: DataTypes.STRING(16),
        allowNull: true,
      },
      numberEntered: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "waiting",
      },
      lastRingAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      tableName: "IvrQueuedCalls",
      timestamps: true,
      indexes: [
        { fields: ["conferenceName"], unique: true },
        { fields: ["callSid"] },
        { fields: ["status"] },
        { fields: ["expiresAt"] },
      ],
    },
  );

  return IvrQueuedCall;
};
