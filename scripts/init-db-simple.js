/* eslint-disable no-console */
"use strict";

const { execSync } = require("child_process");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

/**
 * Compose healthcheck can pass before MySQL accepts TCP from other containers.
 * Retry until a real connection works (same pattern as many production entrypoints).
 */
async function waitForDatabase() {
  const mysql = require("mysql2/promise");
  const json = require("../config/config.json");
  const env = process.env.NODE_ENV || "development";
  const dbConfig = json[env];

  let cfg;
  if (process.env.DATABASE_URL) {
    cfg = process.env.DATABASE_URL;
  } else if (dbConfig.use_env_variable && process.env[dbConfig.use_env_variable]) {
    cfg = process.env[dbConfig.use_env_variable];
  } else if (dbConfig.database && dbConfig.username != null) {
    cfg = {
      host: dbConfig.host,
      port: dbConfig.port || 3306,
      user: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database,
    };
  } else {
    return;
  }

  const maxAttempts = 40;
  const delayMs = 1500;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const conn = await mysql.createConnection(cfg);
      await conn.end();
      if (i > 0) {
        console.log("Database is reachable.");
      }
      return;
    } catch (err) {
      if (i === maxAttempts - 1) {
        throw new Error(
          `Database not reachable after ${maxAttempts} attempts: ${err.message}`,
        );
      }
      if (i === 0) {
        console.log("Waiting for database to accept connections…");
      } else if ((i + 1) % 5 === 0) {
        console.log(`Still waiting… (${i + 1}/${maxAttempts})`);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

function createSequelizeForScripts() {
  const { Sequelize } = require("sequelize");
  const json = require("../config/config.json");
  const env = process.env.NODE_ENV || "development";
  const dbConfig = json[env];

  if (process.env.DATABASE_URL) {
    return new Sequelize(process.env.DATABASE_URL, {
      dialect: "mysql",
      logging: false,
    });
  }

  if (dbConfig.use_env_variable) {
    const url = process.env[dbConfig.use_env_variable];
    if (!url) {
      throw new Error(`Missing ${dbConfig.use_env_variable} for database connection`);
    }
    return new Sequelize(url, {
      dialect: "mysql",
      logging: false,
    });
  }

  if (!dbConfig.database || dbConfig.username == null) {
    return null;
  }

  return new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect || "mysql",
    logging: false,
  });
}

/**
 * If SequelizeMeta says migrations ran but core tables are missing (e.g. volume reset,
 * manual DB edits), drop meta and migrate again.
 */
async function ensureCoreTables() {
  const sequelize = createSequelizeForScripts();
  if (!sequelize) {
    console.warn("Database config incomplete; skipping schema repair check.");
    return;
  }

  const schemaName = sequelize.config.database;
  if (!schemaName) {
    await sequelize.close();
    console.warn("Could not resolve database name; skipping schema repair check.");
    return;
  }

  try {
    const [rows] = await sequelize.query(
      "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = ? AND table_name = 'Users'",
      { replacements: [schemaName] },
    );
    const exists = Number(rows[0]?.c) > 0;
    if (!exists) {
      console.log(
        "Users table missing; clearing SequelizeMeta and re-running migrations…",
      );
      await sequelize.query("DROP TABLE IF EXISTS `SequelizeMeta`");
      run("npx sequelize-cli db:migrate");
    }
  } finally {
    await sequelize.close();
  }
}

async function main() {
  await waitForDatabase();
  run("npx sequelize-cli db:migrate");
  await ensureCoreTables();

  const { hash } = require("bcrypt");
  const db = require("../models");

  const seedUsername = process.env.SEED_ADMIN_USERNAME;
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedUsername || !seedPassword) {
    console.log(
      "SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD not set; skipping default admin seed.",
    );
    return;
  }

  const existing = await db.User.findOne({ where: { username: seedUsername } });
  if (existing) {
    console.log("Default admin user already exists; skipping seed.");
    return;
  }

  const passwordHash = await hash(seedPassword, 10);
  await db.User.create({
    username: seedUsername,
    passwordHash,
    role: "admin",
    managerId: null,
  });
  console.log("Seeded default admin user.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
