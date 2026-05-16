const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const db = require("./models");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT, 10) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
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

  io.use((socket, nextSocket) => {
    try {
      const cookies = parseCookies(socket.handshake.headers?.cookie || "");
      const token = cookies.token;
      const secret = process.env.JWT_SECRET;
      if (!token || !secret) return nextSocket(new Error("Unauthorized"));
      const payload = jwt.verify(token, secret);
      const userId = Number(payload?.sub);
      if (!Number.isInteger(userId) || userId <= 0) return nextSocket(new Error("Unauthorized"));
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

  io.on("connection", (socket) => {
    const userId = Number(socket.data.userId);
    if (!Number.isInteger(userId) || userId <= 0) return;

    socket.join(`user:${userId}`);

    const next = (presence.get(userId) || 0) + 1;
    presence.set(userId, next);
    // First socket for this user → they just came online. Refresh DB
    // lastSeen so the Users page reflects it immediately.
    if (next === 1) touchLastSeen(userId);

    socket.on("disconnect", () => {
      const current = presence.get(userId) || 0;
      const after = Math.max(0, current - 1);
      if (after === 0) {
        presence.delete(userId);
        // Record "last time we saw them" so the away → offline grace window
        // measures from socket disconnect, not from last API request.
        touchLastSeen(userId);
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
