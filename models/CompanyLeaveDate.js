"use strict";

module.exports = (sequelize, DataTypes) => {
  const CompanyLeaveDate = sequelize.define(
    "CompanyLeaveDate",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      /** Company-wide leave / public holiday (YYYY-MM-DD). */
      calendarDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        unique: true,
      },
      label: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      createdByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Users",
          key: "id",
        },
      },
    },
    {
      tableName: "CompanyLeaveDates",
      timestamps: true,
      indexes: [{ unique: true, fields: ["calendarDate"] }],
    },
  );

  CompanyLeaveDate.associate = (models) => {
    CompanyLeaveDate.belongsTo(models.User, {
      as: "createdBy",
      foreignKey: "createdByUserId",
    });
  };

  return CompanyLeaveDate;
};
