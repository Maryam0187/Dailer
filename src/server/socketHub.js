const HUB_KEY = Symbol.for("dialer.socket.hub");

function getHub() {
  if (!globalThis[HUB_KEY]) {
    globalThis[HUB_KEY] = { io: null };
  }
  return globalThis[HUB_KEY];
}

export function setSocketServer(io) {
  getHub().io = io;
}

export function getSocketServer() {
  return getHub().io;
}

export function emitToUser(userId, eventName, payload) {
  const io = getSocketServer();
  const id = Number(userId);
  if (!io || !Number.isInteger(id) || id <= 0) return false;
  io.to(`user:${id}`).emit(eventName, payload);
  return true;
}

