"use strict";

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      username: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM("agent", "manager", "admin"),
        allowNull: false,
        defaultValue: "agent",
      },
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
      tableName: "Users",
      timestamps: true,
      indexes: [{ unique: true, fields: ["username"] }],
    },
  );

  User.associate = (models) => {
    // Self-relation to map agent -> manager.
    User.belongsTo(models.User, { as: "manager", foreignKey: "managerId" });
    User.hasMany(models.User, { as: "agents", foreignKey: "managerId" });
    User.hasMany(models.CallLog, { as: "callLogs", foreignKey: "userId" });
  };

  return User;
};

