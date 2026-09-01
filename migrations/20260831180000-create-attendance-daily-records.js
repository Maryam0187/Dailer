"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("AttendanceDailyRecords", {
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
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: "present",
      },
      tierKey: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      pointPercent: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      pointsEarned: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      firstLoginAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      lastLoginAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      loginCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      minutesAfterStart: {
        type: Sequelize.INTEGER,
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

    await queryInterface.addIndex("AttendanceDailyRecords", ["userId", "calendarDate"], {
      unique: true,
      name: "attendance_daily_records_user_date",
    });
    await queryInterface.addIndex("AttendanceDailyRecords", ["calendarDate"]);

    await queryInterface.addIndex("AttendancePointLogs", ["userId", "calendarDate"], {
      name: "attendance_point_logs_user_date",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("AttendancePointLogs", "attendance_point_logs_user_date");
    await queryInterface.dropTable("AttendanceDailyRecords");
  },
};
