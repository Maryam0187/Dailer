const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const db = require("./models");
const { isLoginAllowed, isSessionValidForToday } = require("./src/server/auth/loginWindow.core.cjs");
const { isUserOnApprovedLeave } = require("./src/server/leave/userLeave.boot.cjs");
const { userHasActiveCall } = require("./src/server/calls/userActiveCall.boot.cjs");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT, 10) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  try {
    const { ensureShiftSettingsLoaded } = require("./src/server/auth/shiftSettings.boot.cjs");
    await ensureShiftSettingsLoaded();
  } catch (err) {
    console.error("[shift] failed to load settings on boot:", err?.message || err);
  }

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
  });

  function parseCookies(rawCookie) {
    const out = {};
    if (!rawCookie) return out;
    for (const part of String(rawCookie).split(";")) {
      const i = part.indexOf("=");
      if (i <= 0) continue;
      const k = part.slice(0, i).trim();
      const v = decodeURIComponent(part.slice(i + 1).trim());
      out[k] = v;
    }
    return out;
  }

  io.use(async (socket, nextSocket) => {
    try {
      const cookies = parseCookies(socket.handshake.headers?.cookie || "");
      const token = cookies.token;
      const secret = process.env.JWT_SECRET;
      if (!token || !secret) return nextSocket(new Error("Unauthorized"));
      const payload = jwt.verify(token, secret);
      const userId = Number(payload?.sub);
      if (!Number.isInteger(userId) || userId <= 0) return nextSocket(new Error("Unauthorized"));

      const user = await db.User.findByPk(userId, {
        attributes: [
          "id",
          "role",
          "isActive",
          "afterShiftAccess",
          "afterShiftLimitedFileId",
          "afterShiftAccessExpiresAt",
        ],
      });
      if (!user || user.isActive === false) return nextSocket(new Error("Unauthorized"));

      if (!isSessionValidForToday(payload)) {
        return nextSocket(new Error("Unauthorized"));
      }
      if (payload?.purpose === "leave_application") {
        return nextSocket(new Error("Unauthorized"));
      }

      const { hasAfterShiftGrant } = require("./src/server/auth/loginWindow.core.cjs");

      if (
        (await isUserOnApprovedLeave(userId)) &&
        user.role !== "admin" &&
        !hasAfterShiftGrant(user)
      ) {
        return nextSocket(new Error("Unauthorized"));
      }
      if (!isLoginAllowed(user)) {
        if (!(await userHasActiveCall(userId))) {
          return nextSocket(new Error("Unauthorized"));
        }
      }

      socket.data.userId = userId;
      return nextSocket();
    } catch {
      return nextSocket(new Error("Unauthorized"));
    }
  });

  const HUB_KEY = Symbol.for("dialer.socket.hub");
  if (!globalThis[HUB_KEY]) {
    globalThis[HUB_KEY] = { io: null, presence: new Map() };
  }
  if (!(globalThis[HUB_KEY].presence instanceof Map)) {
    globalThis[HUB_KEY].presence = new Map();
  }
  globalThis[HUB_KEY].io = io;
  const presence = globalThis[HUB_KEY].presence;

  const AWAY_GRACE_MS = 5 * 60 * 1000;

  async function touchLastSeen(userId) {
    try {
      await db.User.update(
        { activeSessionLastSeenAt: new Date() },
        { where: { id: userId } },
      );
    } catch {
      /* best-effort; presence display falls back to socket-only signal */
    }
  }

  function derivePresenceForUser(row, now = Date.now()) {
    const sessionId = row?.activeSessionId;
    const lastSeenRaw = row?.activeSessionLastSeenAt ?? null;
    const lastSeenMs = lastSeenRaw ? new Date(lastSeenRaw).getTime() : null;
    const rowUserId = row?.id;

    if (!sessionId) {
      return { status: "offline", lastActiveAt: lastSeenRaw };
    }
    if (rowUserId != null && (presence.get(rowUserId) || 0) > 0) {
      return { status: "online", lastActiveAt: lastSeenRaw };
    }
    if (lastSeenMs && now - lastSeenMs <= AWAY_GRACE_MS) {
      return { status: "away", lastActiveAt: lastSeenRaw };
    }
    return { status: "offline", lastActiveAt: lastSeenRaw };
  }

  function presencePayloadForRow(row) {
    const derived = derivePresenceForUser(row);
    return {
      userId: row.id,
      presence: derived.status,
      lastActiveAt: derived.lastActiveAt,
    };
  }

  async function broadcastPresenceUpdate(userId) {
    try {
      const row = await db.User.findByPk(userId, {
        attributes: ["id", "activeSessionId", "activeSessionLastSeenAt"],
      });
      if (!row) return;
      io.to("presence:observers").emit("presence:update", presencePayloadForRow(row));
    } catch {
      /* observers fall back to polling */
    }
  }

  async function tryJoinPresenceObserver(socket) {
    const viewerId = Number(socket.data.userId);
    if (!Number.isInteger(viewerId) || viewerId <= 0) return;
    try {
      const viewer = await db.User.findByPk(viewerId, { attributes: ["role"] });
      if (
        viewer?.role !== "admin" &&
        viewer?.role !== "manager" &&
        viewer?.role !== "supervisor"
      ) {
        return;
      }
      socket.join("presence:observers");
      socket.emit("presence:sync");
      for (const [onlineUserId, count] of presence.entries()) {
        if (count <= 0) continue;
        const row = await db.User.findByPk(onlineUserId, {
          attributes: ["id", "activeSessionId", "activeSessionLastSeenAt"],
        });
        if (!row) continue;
        socket.emit("presence:update", presencePayloadForRow(row));
      }
    } catch (err) {
      console.error("[presence] observer join failed:", err?.message || err);
    }
  }

  io.on("connection", (socket) => {
    const userId = Number(socket.data.userId);
    if (!Number.isInteger(userId) || userId <= 0) return;

    socket.join(`user:${userId}`);
    void tryJoinPresenceObserver(socket);

    const next = (presence.get(userId) || 0) + 1;
    presence.set(userId, next);
    if (next === 1) {
      void touchLastSeen(userId).then(() => broadcastPresenceUpdate(userId));
    }

    socket.on("disconnect", () => {
      const current = presence.get(userId) || 0;
      const after = Math.max(0, current - 1);
      if (after === 0) {
        presence.delete(userId);
        void touchLastSeen(userId).then(() => broadcastPresenceUpdate(userId));
      } else {
        presence.set(userId, after);
      }
    });
  });

  server.listen(port, () => {
    console.log(`Ready on http://${hostname}:${port}`);
  });

  process.on("SIGTERM", () => {
    server.close(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    server.close(() => process.exit(0));
  });
});
