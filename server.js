const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

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

  io.on("connection", (socket) => {
    const userId = Number(socket.data.userId);
    if (Number.isInteger(userId) && userId > 0) {
      socket.join(`user:${userId}`);
    }
  });

  const HUB_KEY = Symbol.for("dialer.socket.hub");
  if (!globalThis[HUB_KEY]) {
    globalThis[HUB_KEY] = { io: null };
  }
  globalThis[HUB_KEY].io = io;

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
