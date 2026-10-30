import { NextResponse } from "next/server";
import { Op } from "sequelize";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  serializeIvrNotificationWithCustomers,
  shapeNotificationForViewer,
} from "@/server/ivr/persistIvrNotification";
import { loadReturnCallStatusByNotification } from "@/server/ivr/returnCallStatus";

export const runtime = "nodejs";

const PAGE_SIZE = 15;

async function countUnreadForUser(userId, isAdmin) {
  if (isAdmin) {
    // Admins: unread where they have a recipient row unread, or legacy rows with no recipients + global readAt null
    const viaRecipient = await db.IvrNotificationRecipient.count({
      where: { userId, readAt: null },
    });
    return viaRecipient;
  }
  return db.IvrNotificationRecipient.count({
    where: { userId, readAt: null },
  });
}

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const countOnly = url.searchParams.get("countOnly") === "1";
  const isAdmin = authedUser.role === "admin";
  const userId = Number(authedUser.id);

  if (countOnly) {
    return NextResponse.json({
      ok: true,
      unreadCount: await countUnreadForUser(userId, isAdmin),
    });
  }

  const pageRaw = Number(url.searchParams.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  let total = 0;
  let rows = [];

  if (isAdmin) {
    // Admins see all inbound notifications
    total = await db.IvrNotification.count();
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * PAGE_SIZE;
    rows = await db.IvrNotification.findAll({
      order: [
        ["updatedAt", "DESC"],
        ["id", "DESC"],
      ],
      limit: PAGE_SIZE,
      offset,
    });

    const notificationIds = rows.map((r) => r.id);
    const recipientRows = await db.IvrNotificationRecipient.findAll({
      where: {
        userId,
        notificationId: { [Op.in]: notificationIds },
      },
      attributes: ["notificationId", "readAt"],
    });
    const readById = new Map(recipientRows.map((r) => [r.notificationId, r.readAt]));

    // Admin-only: who was notified for each callback (agents + admins).
    const allRecipientRows =
      notificationIds.length === 0
        ? []
        : await db.IvrNotificationRecipient.findAll({
            where: { notificationId: { [Op.in]: notificationIds } },
            attributes: ["notificationId", "userId", "readAt"],
            include: [
              {
                model: db.User,
                as: "user",
                attributes: ["id", "username", "displayName", "role"],
                required: false,
              },
            ],
          });
    const notifiedById = new Map();
    for (const rec of allRecipientRows) {
      const list = notifiedById.get(rec.notificationId) || [];
      const u = rec.user;
      list.push({
        id: rec.userId,
        name: String(u?.displayName || u?.username || "").trim() || `User #${rec.userId}`,
        role: u?.role || null,
        readAt: rec.readAt ? new Date(rec.readAt).toISOString() : null,
      });
      notifiedById.set(rec.notificationId, list);
    }

    const returnCallsById = await loadReturnCallStatusByNotification(rows, notifiedById);

    const notifications = await Promise.all(
      rows.map(async (row) => {
        const recipientReadAt = readById.has(row.id) ? readById.get(row.id) : row.readAt;
        const raw = await serializeIvrNotificationWithCustomers(row, { recipientReadAt });
        const shaped = shapeNotificationForViewer(raw, { viewerUserId: userId, isAdmin: true });
        const notifiedUsers = (notifiedById.get(row.id) || []).slice().sort((a, b) => {
          const ar = a.role === "admin" ? 1 : 0;
          const br = b.role === "admin" ? 1 : 0;
          if (ar !== br) return ar - br; // agents first, then admins
          return String(a.name).localeCompare(String(b.name));
        });
        const returnCalls = returnCallsById.get(row.id) || [];
        return shaped ? { ...shaped, notifiedUsers, returnCalls } : null;
      }),
    );

    return NextResponse.json({
      ok: true,
      isAdmin: true,
      unreadCount: await countUnreadForUser(userId, isAdmin),
      notifications: notifications.filter(Boolean),
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

  // Agents: only notifications where they are a recipient
  total = await db.IvrNotificationRecipient.count({ where: { userId } });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;

  const recipientPage = await db.IvrNotificationRecipient.findAll({
    where: { userId },
    order: [
      ["updatedAt", "DESC"],
      ["id", "DESC"],
    ],
    limit: PAGE_SIZE,
    offset,
    include: [
      {
        model: db.IvrNotification,
        as: "notification",
        required: true,
      },
    ],
  });

  const notifications = await Promise.all(
    recipientPage.map(async (rec) => {
      const raw = await serializeIvrNotificationWithCustomers(rec.notification, {
        recipientReadAt: rec.readAt,
      });
      return shapeNotificationForViewer(raw, { viewerUserId: userId, isAdmin: false });
    }),
  );

  return NextResponse.json({
    ok: true,
    isAdmin: false,
    unreadCount: await countUnreadForUser(userId, isAdmin),
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
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = Number(authedUser.id);
  const isAdmin = authedUser.role === "admin";
  const body = await req.json().catch(() => ({}));
  const markAll = Boolean(body?.markAll);
  const ids = Array.isArray(body?.ids)
    ? body.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  const now = new Date();

  if (markAll) {
    await db.IvrNotificationRecipient.update(
      { readAt: now },
      { where: { userId, readAt: null } },
    );
    if (isAdmin) {
      // Also clear legacy global unread for admin views of old rows
      await db.IvrNotification.update({ readAt: now }, { where: { readAt: null } });
    }
  } else if (ids.length) {
    await db.IvrNotificationRecipient.update(
      { readAt: now },
      { where: { userId, notificationId: { [Op.in]: ids }, readAt: null } },
    );
    if (isAdmin) {
      await db.IvrNotification.update(
        { readAt: now },
        { where: { id: { [Op.in]: ids }, readAt: null } },
      );
    }
  } else {
    return NextResponse.json({ error: "ids or markAll required" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    unreadCount: await countUnreadForUser(userId, isAdmin),
  });
}
