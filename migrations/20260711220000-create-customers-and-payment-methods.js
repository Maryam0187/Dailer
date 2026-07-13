"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Customers", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      phone: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      city: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      state: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      zipCode: {
        type: Sequelize.STRING(16),
        allowNull: true,
      },
      serviceType: {
        type: Sequelize.ENUM("dish", "direct", "cable", "streams"),
        allowNull: true,
      },
      cableName: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      streamName: {
        type: Sequelize.STRING(128),
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

    await queryInterface.addIndex("Customers", ["phone"], {
      unique: true,
      name: "customers_phone_unique",
    });

    await queryInterface.createTable("CustomerPaymentMethods", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      customerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Customers", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      type: {
        type: Sequelize.ENUM("card", "e_check", "check_mail", "pos_link"),
        allowNull: false,
      },
      label: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      isDefault: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      brand: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      last4: {
        type: Sequelize.STRING(4),
        allowNull: true,
      },
      expMonth: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      expYear: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      billingName: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      billingZip: {
        type: Sequelize.STRING(16),
        allowNull: true,
      },
      bankName: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      accountLast4: {
        type: Sequelize.STRING(4),
        allowNull: true,
      },
      routingLast4: {
        type: Sequelize.STRING(4),
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdByUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
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

    await queryInterface.addIndex("CustomerPaymentMethods", ["customerId"]);
    await queryInterface.addIndex("CustomerPaymentMethods", ["type"]);

    await queryInterface.addColumn("Leads", "customerId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Customers", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addIndex("Leads", ["customerId"]);

    // Backfill: one customer per phone from the latest lead row.
    await queryInterface.sequelize.query(`
      INSERT INTO \`Customers\`
        (\`phone\`, \`city\`, \`state\`, \`zipCode\`, \`serviceType\`, \`cableName\`, \`streamName\`, \`createdAt\`, \`updatedAt\`)
      SELECT
        l.\`phone\`,
        l.\`city\`,
        l.\`state\`,
        l.\`zipCode\`,
        l.\`serviceType\`,
        l.\`cableName\`,
        l.\`streamName\`,
        UTC_TIMESTAMP(),
        UTC_TIMESTAMP()
      FROM \`Leads\` l
      INNER JOIN (
        SELECT \`phone\`, MAX(\`id\`) AS \`maxId\`
        FROM \`Leads\`
        WHERE \`phone\` IS NOT NULL AND \`phone\` != ''
        GROUP BY \`phone\`
      ) latest ON l.\`id\` = latest.\`maxId\`
    `);

    await queryInterface.sequelize.query(`
      UPDATE \`Leads\` l
      INNER JOIN \`Customers\` c ON c.\`phone\` = l.\`phone\`
      SET l.\`customerId\` = c.\`id\`
      WHERE l.\`customerId\` IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Leads", ["customerId"]).catch(() => {});
    await queryInterface.removeColumn("Leads", "customerId");
    await queryInterface.dropTable("CustomerPaymentMethods");
    await queryInterface.dropTable("Customers");
  },
};
