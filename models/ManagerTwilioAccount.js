"use strict";

module.exports = (sequelize, DataTypes) => {
  const ManagerTwilioAccount = sequelize.define(
    "ManagerTwilioAccount",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      /** Team lead (Users.role = manager). */
      managerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: "Users",
          key: "id",
        },
      },
      accountSid: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      authToken: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      apiKeySid: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      apiKeySecret: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      /** Optional default From when a team user has no assigned number. */
      defaultFromNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
    },
    {
      tableName: "ManagerTwilioAccounts",
      timestamps: true,
      indexes: [{ unique: true, fields: ["managerId"] }],
    },
  );

  ManagerTwilioAccount.associate = (models) => {
    ManagerTwilioAccount.belongsTo(models.User, {
      as: "manager",
      foreignKey: "managerId",
    });
    ManagerTwilioAccount.hasMany(models.TwilioPhoneNumber, {
      as: "phoneNumbers",
      foreignKey: "managerId",
      sourceKey: "managerId",
    });
  };

  return ManagerTwilioAccount;
};
