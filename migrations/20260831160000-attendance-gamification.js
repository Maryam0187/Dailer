"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("UserAttendanceStats", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      totalPoints: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      currentOnTimeStreak: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      longestOnTimeStreak: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      lastProcessedDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("UserAttendanceStats", ["userId"], { unique: true });

    await queryInterface.createTable("AttendancePointLogs", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      calendarDate: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      points: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      pointPercent: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      reason: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      tierKey: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("AttendancePointLogs", ["userId", "calendarDate"]);
    await queryInterface.addIndex("AttendancePointLogs", ["userId", "calendarDate", "reason"], {
      unique: true,
      name: "attendance_point_logs_user_date_reason",
    });

    await queryInterface.createTable("UserAttendanceBadges", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      badgeKey: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      earnedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("UserAttendanceBadges", ["userId"]);
    await queryInterface.addIndex("UserAttendanceBadges", ["userId", "badgeKey"], {
      unique: true,
      name: "user_attendance_badges_user_badge",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("UserAttendanceBadges");
    await queryInterface.dropTable("AttendancePointLogs");
    await queryInterface.dropTable("UserAttendanceStats");
  },
};
