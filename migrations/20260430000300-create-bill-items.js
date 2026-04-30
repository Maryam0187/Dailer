"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("BillItems", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      billId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Bills",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      callLogId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "CallLogs",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      twilioSid: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      toNumber: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      fromNumber: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      durationSeconds: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      twilioCost: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
      },
      markupApplied: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: false,
      },
      lineAmount: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
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

    await queryInterface.addIndex("BillItems", ["billId"]);
    await queryInterface.addIndex("BillItems", ["twilioSid"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("BillItems");
  },
};
