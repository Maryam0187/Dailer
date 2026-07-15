import crypto from "node:crypto";

const PREFIX = "enc.v1:";

function resolveKeyMaterial() {
  const dedicated = process.env.TOTP_ENCRYPTION_KEY;
  if (dedicated && String(dedicated).trim()) {
    return String(dedicated).trim();
  }
  const jwt = process.env.JWT_SECRET;
  if (jwt && String(jwt).trim()) {
    return `totp:${String(jwt).trim()}`;
  }
  return null;
}

function getEncryptionKey() {
  const material = resolveKeyMaterial();
  if (!material) {
    throw new Error("TOTP_ENCRYPTION_KEY (or JWT_SECRET) must be set to encrypt TOTP secrets");
  }
  return crypto.createHash("sha256").update(material, "utf8").digest();
}

export function encryptTotpSecret(plaintext) {
  if (plaintext == null) return null;
  const text = String(plaintext);
  if (!text) return null;
  if (text.startsWith(PREFIX)) return text;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString("base64url");
  return `${PREFIX}${payload}`;
}

export function decryptTotpSecret(value) {
  if (value == null) return null;
  const text = String(value);
  if (!text) return null;
  if (!text.startsWith(PREFIX)) return text;

  const raw = Buffer.from(text.slice(PREFIX.length), "base64url");
  if (raw.length < 12 + 16 + 1) {
    throw new Error("Invalid encrypted TOTP secret payload");
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
