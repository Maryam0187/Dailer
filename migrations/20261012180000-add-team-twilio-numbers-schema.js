"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ManagerTwilioAccounts", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      managerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      accountSid: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      authToken: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      apiKeySid: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      apiKeySecret: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      defaultFromNumber: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.createTable("TwilioPhoneNumbers", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      phoneNumber: {
        type: Sequelize.STRING(32),
        allowNull: false,
        unique: true,
      },
      accountKind: {
        type: Sequelize.ENUM("main", "team"),
        allowNull: false,
        defaultValue: "main",
      },
      managerId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      twilioSid: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      friendlyName: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      label: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("TwilioPhoneNumbers", ["accountKind", "managerId"], {
      name: "twilio_phone_numbers_account_kind_manager_id",
    });

    await queryInterface.addColumn("Users", "twilioFromNumber", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("Users", "twilioFromNumberLine2", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });

    await queryInterface.addColumn("Bills", "managerId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addIndex("Bills", ["managerId"], {
      name: "bills_manager_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Bills", "bills_manager_id");
    await queryInterface.removeColumn("Bills", "managerId");
    await queryInterface.removeColumn("Users", "twilioFromNumberLine2");
    await queryInterface.removeColumn("Users", "twilioFromNumber");
    await queryInterface.dropTable("TwilioPhoneNumbers");
    await queryInterface.dropTable("ManagerTwilioAccounts");
  },
};
