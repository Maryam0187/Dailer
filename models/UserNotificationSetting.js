"use strict";

module.exports = (sequelize, DataTypes) => {
  const UserNotificationSetting = sequelize.define(
    "UserNotificationSetting",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: "Users", key: "id" },
      },
      scheduleEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      timezone: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: "Asia/Karachi",
      },
      allowStartLocal: {
        type: DataTypes.STRING(5),
        allowNull: false,
        defaultValue: "09:00",
      },
      allowEndLocal: {
        type: DataTypes.STRING(5),
        allowNull: false,
        defaultValue: "18:00",
      },
      allowDays: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [1, 2, 3, 4, 5],
      },
    },
    {
      tableName: "UserNotificationSettings",
      timestamps: true,
    },
  );

  UserNotificationSetting.associate = (models) => {
    UserNotificationSetting.belongsTo(models.User, { as: "user", foreignKey: "userId" });
  };

  return UserNotificationSetting;
};
