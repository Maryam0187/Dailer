import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { serializeIvrNotificationWithCustomers } from "@/server/ivr/persistIvrNotification";

export const runtime = "nodejs";

const PAGE_SIZE = 15;

async function countUnread() {
  return db.IvrNotification.count({ where: { readAt: null } });
}

export async function GET(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const pageRaw = Number(url.searchParams.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const total = await db.IvrNotification.count();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;

  const rows = await db.IvrNotification.findAll({
    order: [
      ["updatedAt", "DESC"],
      ["id", "DESC"],
    ],
    limit: PAGE_SIZE,
    offset,
  });

  const notifications = await Promise.all(rows.map((row) => serializeIvrNotificationWithCustomers(row)));

  return NextResponse.json({
    ok: true,
    unreadCount: await countUnread(),
    notifications,
    pagination: {
      page: safePage,
      pageSize: PAGE_SIZE,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
    },
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
