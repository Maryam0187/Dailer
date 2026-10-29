"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addIndex("CallLogs", ["toNumber", "createdAt"], {
      name: "call_logs_to_number_created_at",
    });

    await queryInterface.addColumn("IvrNotifications", "leadInSystem", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("IvrNotifications", "notifySource", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("IvrNotifications", "messageMode", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });

    await queryInterface.createTable("IvrNotificationRecipients", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      notificationId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "IvrNotifications", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      readAt: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex("IvrNotificationRecipients", ["notificationId", "userId"], {
      unique: true,
      name: "ivr_notif_recipients_notification_user_unique",
    });
    await queryInterface.addIndex("IvrNotificationRecipients", ["userId", "readAt"], {
      name: "ivr_notif_recipients_user_read",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("IvrNotificationRecipients");
    await queryInterface.removeColumn("IvrNotifications", "messageMode");
    await queryInterface.removeColumn("IvrNotifications", "notifySource");
    await queryInterface.removeColumn("IvrNotifications", "leadInSystem");
    await queryInterface.removeIndex("CallLogs", "call_logs_to_number_created_at");
  },
};
