"use strict";

module.exports = (sequelize, DataTypes) => {
  const IvrNotification = sequelize.define(
    "IvrNotification",
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
      lastEventType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "incoming",
      },
      step: {
        type: DataTypes.STRING(32),
        allowNull: true,
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
      /** @deprecated Unused — kept for existing DB rows from old associate IVR path. */
      associate: {
        type: DataTypes.STRING(8),
        allowNull: true,
      },
      /** @deprecated Unused — kept for existing DB rows from old associate IVR path. */
      numberEntered: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      readAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "IvrNotifications",
      timestamps: true,
      indexes: [
        { fields: ["callSid"] },
        { fields: ["createdAt"] },
        { fields: ["readAt"] },
      ],
    },
  );

  return IvrNotification;
};
