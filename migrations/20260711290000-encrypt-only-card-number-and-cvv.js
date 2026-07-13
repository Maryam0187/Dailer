"use strict";

const crypto = require("crypto");

const PREFIX = "enc.v1:";

const PREVIOUSLY_ENCRYPTED_FIELDS = [
  "cardType",
  "brand",
  "expDate",
  "routingNumber",
  "accountNumber",
  "checkNumber",
  "bankName",
  "notes",
];

const STILL_ENCRYPTED_FIELDS = ["cardNumber", "cvv"];

function keyFromMaterial(material) {
  return crypto.createHash("sha256").update(String(material), "utf8").digest();
}

function candidateKeys() {
  const keys = [];
  const dedicated = process.env.PAYMENT_DATA_ENCRYPTION_KEY?.trim();
  const jwt = process.env.JWT_SECRET?.trim();
  if (dedicated) keys.push(keyFromMaterial(dedicated));
  if (jwt) {
    keys.push(keyFromMaterial(`payment:${jwt}`));
    keys.push(keyFromMaterial(jwt));
  }
  // Local docker defaults used during development
  keys.push(keyFromMaterial("change-me-to-a-long-random-payment-encryption-key"));
  keys.push(keyFromMaterial("payment:change-me-to-a-long-random-string"));
  keys.push(keyFromMaterial("change-me-to-a-long-random-string"));
  return keys;
}

function isEncryptedValue(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

function decryptWithKey(value, key) {
  const raw = Buffer.from(value.slice(PREFIX.length), "base64url");
  if (raw.length < 12 + 16 + 1) throw new Error("Invalid payload");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function decryptAny(value) {
  if (!isEncryptedValue(value)) return value;
  let lastErr;
  for (const key of candidateKeys()) {
    try {
      return decryptWithKey(value, key);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Unable to decrypt payment field");
}

function encryptWithPreferredKey(plaintext) {
  const dedicated = process.env.PAYMENT_DATA_ENCRYPTION_KEY?.trim();
  const jwt = process.env.JWT_SECRET?.trim();
  const material =
    dedicated ||
    (jwt ? `payment:${jwt}` : "change-me-to-a-long-random-payment-encryption-key");
  const key = keyFromMaterial(material);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64url")}`;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT \`id\`, \`cardType\`, \`brand\`, \`cardNumber\`, \`expDate\`, \`cvv\`,
              \`routingNumber\`, \`accountNumber\`, \`checkNumber\`, \`bankName\`, \`notes\`
       FROM \`CustomerPaymentMethods\``,
    );

    for (const row of rows) {
      const updates = {};

      for (const field of PREVIOUSLY_ENCRYPTED_FIELDS) {
        const value = row[field];
        if (value == null || value === "") continue;
        if (!isEncryptedValue(value)) continue;
        updates[field] = decryptAny(value);
      }

      for (const field of STILL_ENCRYPTED_FIELDS) {
        const value = row[field];
        if (value == null || value === "") continue;
        if (isEncryptedValue(value)) {
          // Re-encrypt with preferred key for consistency
          const plain = decryptAny(value);
          updates[field] = encryptWithPreferredKey(plain);
        } else {
          updates[field] = encryptWithPreferredKey(value);
        }
      }

      if (Object.keys(updates).length === 0) continue;

      const setClauses = Object.keys(updates)
        .map((field) => `\`${field}\` = :${field}`)
        .join(", ");
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(
        `UPDATE \`CustomerPaymentMethods\` SET ${setClauses} WHERE \`id\` = :id`,
        { replacements: { id: row.id, ...updates } },
      );
    }
  },

  async down() {
    // No-op
  },
};
