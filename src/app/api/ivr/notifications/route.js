import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { serializeIvrNotification } from "@/server/ivr/persistIvrNotification";

export const runtime = "nodejs";

async function countUnread() {
  return db.IvrNotification.count({ where: { readAt: null } });
}

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const rows = await db.IvrNotification.findAll({
    order: [
      ["updatedAt", "DESC"],
      ["id", "DESC"],
    ],
    limit: 100,
  });

  return NextResponse.json({
    ok: true,
    unreadCount: await countUnread(),
    notifications: rows.map(serializeIvrNotification),
  });
}

export async function PATCH(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => ({}));
  const markAll = Boolean(body?.markAll);
  const ids = Array.isArray(body?.ids)
    ? body.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  const now = new Date();
  if (markAll) {
    await db.IvrNotification.update({ readAt: now }, { where: { readAt: null } });
  } else if (ids.length) {
    await db.IvrNotification.update(
      { readAt: now },
      { where: { id: { [Op.in]: ids }, readAt: null } },
    );
  } else {
    return NextResponse.json({ error: "ids or markAll required" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, unreadCount: await countUnread() });
}
