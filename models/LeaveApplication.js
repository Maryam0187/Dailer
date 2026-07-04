"use strict";

module.exports = (sequelize, DataTypes) => {
  const LeaveApplication = sequelize.define(
    "LeaveApplication",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "approved", "rejected", "cancelled"),
        allowNull: false,
        defaultValue: "approved",
      },
      reviewedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Users",
          key: "id",
        },
      },
      reviewedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      cancelRequestedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "LeaveApplications",
      timestamps: true,
    },
  );

  LeaveApplication.associate = (models) => {
    LeaveApplication.belongsTo(models.User, { as: "user", foreignKey: "userId" });
    LeaveApplication.belongsTo(models.User, { as: "reviewer", foreignKey: "reviewedBy" });
  };

  return LeaveApplication;
};
