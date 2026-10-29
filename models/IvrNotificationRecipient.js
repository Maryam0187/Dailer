"use strict";

module.exports = (sequelize, DataTypes) => {
  const IvrNotificationRecipient = sequelize.define(
    "IvrNotificationRecipient",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      notificationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      readAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "IvrNotificationRecipients",
      timestamps: true,
      indexes: [
        { unique: true, fields: ["notificationId", "userId"] },
        { fields: ["userId", "readAt"] },
      ],
    },
  );

  IvrNotificationRecipient.associate = (models) => {
    IvrNotificationRecipient.belongsTo(models.IvrNotification, {
      as: "notification",
      foreignKey: "notificationId",
    });
    IvrNotificationRecipient.belongsTo(models.User, {
      as: "user",
      foreignKey: "userId",
    });
  };

  return IvrNotificationRecipient;
};
