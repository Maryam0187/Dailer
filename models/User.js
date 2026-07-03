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
        type: DataTypes.ENUM("agent", "manager", "supervisor", "admin", "lead_monitor"),
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
      supervisorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Users",
          key: "id",
        },
      },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Users",
          key: "id",
        },
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      activeSessionId: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      activeSessionLastSeenAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      afterShiftAccess: {
        type: DataTypes.ENUM("none", "full", "limited"),
        allowNull: false,
        defaultValue: "none",
      },
      afterShiftLimitedFileId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "UserFiles",
          key: "id",
        },
      },
      afterShiftAccessExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      afterShiftGrantDurationMinutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      tableName: "Users",
      timestamps: true,
      indexes: [{ unique: true, fields: ["username"] }],
    },
  );

  User.associate = (models) => {
    // Self-relations for org hierarchy.
    User.belongsTo(models.User, { as: "manager", foreignKey: "managerId" });
    User.hasMany(models.User, { as: "agents", foreignKey: "managerId" });
    User.belongsTo(models.User, { as: "supervisor", foreignKey: "supervisorId" });
    User.hasMany(models.User, { as: "supervisedAgents", foreignKey: "supervisorId" });
    User.belongsTo(models.User, { as: "creator", foreignKey: "createdBy" });
    User.hasMany(models.User, { as: "createdUsers", foreignKey: "createdBy" });
    User.belongsTo(models.UserFile, {
      as: "afterShiftLimitedFile",
      foreignKey: "afterShiftLimitedFileId",
    });
    User.hasMany(models.CallLog, { as: "callLogs", foreignKey: "userId" });
    User.hasMany(models.Bill, { as: "generatedBills", foreignKey: "generatedBy" });
    User.hasMany(models.BillingSetting, { as: "updatedBillingSettings", foreignKey: "updatedBy" });
    User.hasMany(models.ShiftSetting, { as: "updatedShiftSettings", foreignKey: "updatedBy" });
    User.hasMany(models.UserActivity, { as: "activities", foreignKey: "userId" });
    User.hasMany(models.LeaveApplication, { as: "leaveApplications", foreignKey: "userId" });
  };

  return User;
};
