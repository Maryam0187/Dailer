"use strict";

module.exports = (sequelize, DataTypes) => {
  const UserAttendanceBadge = sequelize.define(
    "UserAttendanceBadge",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      badgeKey: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      earnedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "UserAttendanceBadges",
      timestamps: true,
      indexes: [
        { fields: ["userId"] },
        { fields: ["userId", "badgeKey"], unique: true },
      ],
    },
  );

  UserAttendanceBadge.associate = (models) => {
    UserAttendanceBadge.belongsTo(models.User, { foreignKey: "userId", as: "user" });
  };

  return UserAttendanceBadge;
};
