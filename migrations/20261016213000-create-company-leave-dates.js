"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("CompanyLeaveDates", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      calendarDate: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        unique: true,
      },
      label: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      createdByUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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

    await queryInterface.addIndex("CompanyLeaveDates", ["calendarDate"], {
      unique: true,
      name: "company_leave_dates_calendar_date_uq",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("CompanyLeaveDates");
  },
};
