import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "@/server/db";

/**
 * Fresh login is the strongest "previous session is dead" signal — wipe any
 * lingering active-session lock so the new tab/device can claim it.
 */
async function clearActiveSession(userId) {
  if (!Number.isInteger(userId) || userId <= 0) return;
  await db.User.update(
    { activeSessionId: null, activeSessionLastSeenAt: null },
    { where: { id: userId } },
  );
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const username = body?.username;
  const password = body?.password;

  if (!username || !password) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  const user = await db.User.findOne({ where: { username } });
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (user.isActive === false) {
    return NextResponse.json({ error: "Account is deactivated" }, { status: 403 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "JWT_SECRET not configured" }, { status: 500 });
  }

  await clearActiveSession(user.id);

  const token = jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: "7d" });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}

