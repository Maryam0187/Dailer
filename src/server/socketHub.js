const HUB_KEY = Symbol.for("dialer.socket.hub");

function getHub() {
  if (!globalThis[HUB_KEY]) {
    globalThis[HUB_KEY] = {
      io: null,
      // userId -> number of currently connected sockets for that user.
      // A user is "online" iff this count is > 0. We count instead of
      // tracking sids to gracefully support multiple tabs / devices.
      presence: new Map(),
    };
  }
  const hub = globalThis[HUB_KEY];
  if (!(hub.presence instanceof Map)) hub.presence = new Map();
  return hub;
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

/**
 * Bump the connected socket count for a user. Returns the new count.
 * Callers should treat a transition 0 → 1 as "user just came online".
 */
export function markUserConnected(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return 0;
  const { presence } = getHub();
  const next = (presence.get(id) || 0) + 1;
  presence.set(id, next);
  return next;
}

/**
 * Decrement the connected socket count for a user. Returns the new count
 * (0 means the user is no longer online from any tab/device).
 */
export function markUserDisconnected(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return 0;
  const { presence } = getHub();
  const current = presence.get(id) || 0;
  const next = Math.max(0, current - 1);
  if (next === 0) {
    presence.delete(id);
  } else {
    presence.set(id, next);
  }
  return next;
}

export function isUserOnline(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const { presence } = getHub();
  return (presence.get(id) || 0) > 0;
}

export function getOnlineUserIds() {
  const { presence } = getHub();
  return Array.from(presence.keys());
}

