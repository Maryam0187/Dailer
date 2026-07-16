import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

export const TOTP_TRUST_COOKIE = "totp_trust";

/** Days a browser stays trusted after successful 2FA (default 7). */
export function getTotpTrustDays() {
  const raw = Number(process.env.TOTP_TRUST_DAYS);
  if (Number.isFinite(raw) && raw >= 1 && raw <= 365) return Math.floor(raw);
  return 7;
}

export function totpTrustCookieOptions(maxAgeSeconds) {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  };
}

export function createTotpTrustToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  const days = getTotpTrustDays();
  const maxAge = days * 24 * 60 * 60;
  const token = jwt.sign(
    {
      sub: user.id,
      purpose: "totp_trust",
      v: Number(user.totpTrustVersion) || 0,
    },
    secret,
    { expiresIn: `${days}d` },
  );
  return { token, maxAge, days };
}

/**
 * True when this browser has a valid trust cookie for the user
 * (skips TOTP until expiry or trust version bump).
 */
export async function hasValidTotpTrust(user) {
  if (!user?.totpEnabled) return false;

  const secret = process.env.JWT_SECRET;
  if (!secret) return false;

  const cookieStore = await cookies();
  const token = cookieStore.get(TOTP_TRUST_COOKIE)?.value;
  if (!token) return false;

  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return false;
  }

  if (payload?.purpose !== "totp_trust") return false;
  if (Number(payload.sub) !== Number(user.id)) return false;
  if (Number(payload.v) !== (Number(user.totpTrustVersion) || 0)) return false;
  return true;
}

export function clearTotpTrustCookie(response) {
  response.cookies.set(TOTP_TRUST_COOKIE, "", {
    ...totpTrustCookieOptions(0),
    maxAge: 0,
  });
  return response;
}

export function setTotpTrustCookie(response, user) {
  const created = createTotpTrustToken(user);
  if (!created) return response;
  response.cookies.set(TOTP_TRUST_COOKIE, created.token, totpTrustCookieOptions(created.maxAge));
  return response;
}
