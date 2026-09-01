"use strict";

module.exports = (sequelize, DataTypes) => {
  const UserAttendanceStats = sequelize.define(
    "UserAttendanceStats",
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
      totalPoints: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      currentOnTimeStreak: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      longestOnTimeStreak: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      lastProcessedDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
    },
    {
      tableName: "UserAttendanceStats",
      timestamps: true,
      indexes: [{ fields: ["userId"], unique: true }],
    },
  );

  UserAttendanceStats.associate = (models) => {
    UserAttendanceStats.belongsTo(models.User, { foreignKey: "userId", as: "user" });
  };

  return UserAttendanceStats;
};
