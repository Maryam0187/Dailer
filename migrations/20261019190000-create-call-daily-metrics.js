"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("CallDailyMetrics", {
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
      total: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      completed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      noAnswer: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      failedOrCanceled: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      busy: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      durationSeconds: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      confTotal: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      confCompleted: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      confNoAnswer: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      confFailedOrCanceled: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      confBusy: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      confDurationSeconds: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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

    await queryInterface.addIndex("CallDailyMetrics", ["userId", "calendarDate"], {
      unique: true,
      name: "call_daily_metrics_user_date",
    });
    await queryInterface.addIndex("CallDailyMetrics", ["calendarDate"], {
      name: "call_daily_metrics_calendar_date",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("CallDailyMetrics");
  },
};
