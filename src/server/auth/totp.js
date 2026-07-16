import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";
import { decryptTotpSecret, encryptTotpSecret } from "@/server/crypto/totpSecretEncryption";

const ISSUER = process.env.TOTP_ISSUER || "Dialer";

/** Challenge at login when admin has opted in. */
export function isTotpRequiredAtLogin(user) {
  return user?.role === "admin" && user?.totpEnabled === true;
}

export function canManageTotp(user) {
  return user?.role === "admin";
}

export function generateTotpSecret() {
  return new Secret({ size: 20 });
}

export function buildTotp({ secret, label }) {
  const secretObj = typeof secret === "string" ? Secret.fromBase32(secret) : secret;
  return new TOTP({
    issuer: ISSUER,
    label: label || "user",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: secretObj,
  });
}

export function encryptSecret(secret) {
  const base32 = typeof secret === "string" ? secret : secret.base32;
  return encryptTotpSecret(base32);
}

export function decryptSecret(encrypted) {
  return decryptTotpSecret(encrypted);
}

export function verifyTotpCode(secretBase32, token) {
  if (!secretBase32 || typeof token !== "string") return false;
  const code = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return false;
  const totp = buildTotp({ secret: secretBase32 });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export async function buildEnrollmentPayload({ secret, username }) {
  const totp = buildTotp({ secret, label: username });
  const otpauthUrl = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
  });
  return {
    otpauthUrl,
    qrDataUrl,
    manualKey: secret.base32,
  };
}

/** Clear TOTP and bump trust version so remembered devices must verify again. */
export function clearTotpFields(user = null) {
  return {
    totpSecretEncrypted: null,
    totpEnabled: false,
    totpEnabledAt: null,
    totpTrustVersion: (Number(user?.totpTrustVersion) || 0) + 1,
  };
}
