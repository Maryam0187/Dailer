import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

function normalizeDisplayName(value) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length > 128) return undefined;
  return trimmed;
}

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await db.User.findByPk(authedUser.id, {
    attributes: ["id", "username", "displayName", "role"],
  });
  if (!row) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: row.id,
    username: row.username,
    displayName: row.displayName ? String(row.displayName) : null,
    role: row.role,
  });
}

export async function PATCH(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Object.prototype.hasOwnProperty.call(body ?? {}, "displayName")) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  const displayName = normalizeDisplayName(body.displayName);
  if (displayName === undefined) {
    return NextResponse.json(
      { error: "displayName must be a string of at most 128 characters" },
      { status: 400 },
    );
  }

  await db.User.update({ displayName }, { where: { id: authedUser.id } });

  const row = await db.User.findByPk(authedUser.id, {
    attributes: ["id", "username", "displayName", "role"],
  });

  return NextResponse.json({
    id: row.id,
    username: row.username,
    displayName: row.displayName ? String(row.displayName) : null,
    role: row.role,
  });
}
