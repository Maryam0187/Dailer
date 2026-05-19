"use strict";

module.exports = (sequelize, DataTypes) => {
  const CallLog = sequelize.define(
    "CallLog",
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
      fromNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      toNumber: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      direction: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "outbound",
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "queued",
      },
      /** Agent (parent) Twilio Call SID — Outgoing API to client:identity. */
      twilioSid: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      /** Customer PSTN leg SID — child Outgoing Dial under twilioSid. */
      customerCallSid: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      agentDurationSeconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      customerDurationSeconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      conferenceName: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      durationSeconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      recordingSid: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      recordingStatus: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      recordingDurationSeconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      tableName: "CallLogs",
      timestamps: true,
      indexes: [
        { fields: ["userId"] },
        { fields: ["twilioSid"] },
        { fields: ["customerCallSid"] },
        { fields: ["recordingSid"] },
      ],
    },
  );

  CallLog.associate = (models) => {
    CallLog.belongsTo(models.User, { as: "user", foreignKey: "userId" });
    CallLog.hasMany(models.InviteDialLeg, { foreignKey: "callLogId", as: "inviteDialLegs" });
  };

  return CallLog;
};

