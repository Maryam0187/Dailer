"use strict";

module.exports = (sequelize, DataTypes) => {
  const InviteDialLeg = sequelize.define(
    "InviteDialLeg",
    {
      callSid: {
        type: DataTypes.STRING(64),
        primaryKey: true,
        allowNull: false,
      },
      callLogId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      conferenceName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      invitedUserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      tableName: "InviteDialLegs",
      timestamps: true,
    },
  );

  InviteDialLeg.associate = (models) => {
    InviteDialLeg.belongsTo(models.CallLog, { foreignKey: "callLogId" });
    InviteDialLeg.belongsTo(models.User, { foreignKey: "invitedUserId", as: "invitedUser" });
  };

  return InviteDialLeg;
};
