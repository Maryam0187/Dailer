"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Bills", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      fromDate: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      toDate: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      currency: {
        type: Sequelize.STRING(8),
        allowNull: false,
        defaultValue: "USD",
      },
      twilioBaseAmount: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
      },
      fixedMarkupPerCall: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: false,
      },
      markupAmount: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
      },
      totalCalls: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      totalAmount: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "generated",
      },
      pdfPath: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      generatedBy: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
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

    await queryInterface.addIndex("Bills", ["fromDate", "toDate"]);
    await queryInterface.addIndex("Bills", ["generatedBy"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Bills");
  },
};
