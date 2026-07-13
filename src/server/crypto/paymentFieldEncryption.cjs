"use strict";

const crypto = require("crypto");

const PREFIX = "enc.v1:";

/** Fields stored encrypted at rest on CustomerPaymentMethods. */
const ENCRYPTED_PAYMENT_FIELDS = ["cardNumber", "cvv"];

function resolveKeyMaterial() {
  const dedicated = process.env.PAYMENT_DATA_ENCRYPTION_KEY;
  if (dedicated && String(dedicated).trim()) {
    return String(dedicated).trim();
  }
  const jwt = process.env.JWT_SECRET;
  if (jwt && String(jwt).trim()) {
    return `payment:${String(jwt).trim()}`;
  }
  return null;
}

function getEncryptionKey() {
  const material = resolveKeyMaterial();
  if (!material) {
    throw new Error(
      "PAYMENT_DATA_ENCRYPTION_KEY (or JWT_SECRET) must be set to encrypt payment data",
    );
  }
  return crypto.createHash("sha256").update(material, "utf8").digest();
}

function isEncryptedValue(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

function encryptField(plaintext) {
  if (plaintext == null) return null;
  const text = String(plaintext);
  if (!text) return null;
  if (isEncryptedValue(text)) return text;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString("base64url");
  return `${PREFIX}${payload}`;
}

function decryptField(value) {
  if (value == null) return null;
  const text = String(value);
  if (!text) return null;
  if (!isEncryptedValue(text)) return text;

  const raw = Buffer.from(text.slice(PREFIX.length), "base64url");
  if (raw.length < 12 + 16 + 1) {
    throw new Error("Invalid encrypted payment field payload");
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

function encryptPaymentFields(values) {
  if (!values || typeof values !== "object") return values;
  const out = { ...values };
  for (const field of ENCRYPTED_PAYMENT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(out, field) && out[field] != null) {
      out[field] = encryptField(out[field]);
    }
  }
  return out;
}

function decryptPaymentFields(values) {
  if (!values || typeof values !== "object") return values;
  const out = { ...values };
  for (const field of ENCRYPTED_PAYMENT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(out, field) && out[field] != null) {
      out[field] = decryptField(out[field]);
    }
  }
  return out;
}

function isSequelizeInstance(instance) {
  return (
    instance != null &&
    typeof instance.getDataValue === "function" &&
    typeof instance.setDataValue === "function"
  );
}

function applyEncryptToInstance(instance) {
  if (!isSequelizeInstance(instance)) return;
  for (const field of ENCRYPTED_PAYMENT_FIELDS) {
    if (!instance.isNewRecord && !instance.changed(field)) continue;
    const current = instance.getDataValue(field);
    if (current == null || current === "") continue;
    if (isEncryptedValue(current)) continue;
    instance.setDataValue(field, encryptField(current));
  }
}

function applyDecryptToInstance(instance) {
  if (!isSequelizeInstance(instance)) return;
  for (const field of ENCRYPTED_PAYMENT_FIELDS) {
    const current = instance.getDataValue(field);
    if (current == null || current === "") continue;
    if (!isEncryptedValue(current)) continue;
    try {
      instance.setDataValue(field, decryptField(current));
      if (typeof instance.changed === "function") {
        instance.changed(field, false);
      }
    } catch (err) {
      console.error(`Failed to decrypt payment field ${field}:`, err.message);
    }
  }
}

module.exports = {
  ENCRYPTED_PAYMENT_FIELDS,
  isEncryptedValue,
  encryptField,
  decryptField,
  encryptPaymentFields,
  decryptPaymentFields,
  applyEncryptToInstance,
  applyDecryptToInstance,
};
