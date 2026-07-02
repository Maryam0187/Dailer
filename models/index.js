"use strict";

const { Sequelize } = require("sequelize");
const config = require("../config/config.json");
const userModelFactory = require("./User");
const callLogModelFactory = require("./CallLog");
const leadModelFactory = require("./Lead");
const leadUpdateModelFactory = require("./LeadUpdate");
const inviteDialLegModelFactory = require("./InviteDialLeg");
const billingSettingModelFactory = require("./BillingSetting");
const shiftSettingModelFactory = require("./ShiftSetting");
const billModelFactory = require("./Bill");
const billItemModelFactory = require("./BillItem");
const userFileModelFactory = require("./UserFile");
const userActivityModelFactory = require("./UserActivity");

const env = process.env.NODE_ENV || "development";
const dbConfig = config[env];

let sequelize;

if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: "mysql",
    logging: false,
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: true,
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });
} else {
  sequelize = new Sequelize(
    dbConfig.database,
    dbConfig.username,
    dbConfig.password,
    {
      host: dbConfig.host,
      port: dbConfig.port,
      dialect: "mysql",
      logging: dbConfig.logging || false,
      define: dbConfig.define || {
        timestamps: true,
        underscored: false,
        freezeTableName: true,
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    },
  );
}

const db = { sequelize };
db.User = userModelFactory(sequelize, Sequelize.DataTypes);
db.CallLog = callLogModelFactory(sequelize, Sequelize.DataTypes);
db.Lead = leadModelFactory(sequelize, Sequelize.DataTypes);
db.LeadUpdate = leadUpdateModelFactory(sequelize, Sequelize.DataTypes);
db.InviteDialLeg = inviteDialLegModelFactory(sequelize, Sequelize.DataTypes);
db.BillingSetting = billingSettingModelFactory(sequelize, Sequelize.DataTypes);
db.ShiftSetting = shiftSettingModelFactory(sequelize, Sequelize.DataTypes);
db.Bill = billModelFactory(sequelize, Sequelize.DataTypes);
db.BillItem = billItemModelFactory(sequelize, Sequelize.DataTypes);
db.UserFile = userFileModelFactory(sequelize, Sequelize.DataTypes);
db.UserActivity = userActivityModelFactory(sequelize, Sequelize.DataTypes);

for (const modelName of Object.keys(db)) {
  const model = db[modelName];
  if (model && model.associate) {
    model.associate(db);
  }
}

module.exports = db;
