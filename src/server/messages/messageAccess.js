import { Op } from "sequelize";
import db from "@/server/db";
import { derivePresence } from "@/server/auth/presence";

export function isAdminRole(role) {
  return role === "admin";
}

export function canonicalDmPair(userIdA, userIdB) {
  const a = Number(userIdA);
  const b = Number(userIdB);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0) {
    return null;
  }
  if (a === b) return null;
  return a < b ? { dmUserLowId: a, dmUserHighId: b } : { dmUserLowId: b, dmUserHighId: a };
}

export function otherDmUserId(conversation, viewerId) {
  const viewer = Number(viewerId);
  if (Number(conversation.dmUserLowId) === viewer) return Number(conversation.dmUserHighId);
  if (Number(conversation.dmUserHighId) === viewer) return Number(conversation.dmUserLowId);
  return null;
}

export function isConversationParticipant(conversation, userId) {
  const uid = Number(userId);
  return (
    Number(conversation.dmUserLowId) === uid || Number(conversation.dmUserHighId) === uid
  );
}

/** Any active user may DM any other active user (no self-DM). */
export async function canMessageUser(viewer, targetUserId) {
  const targetId = Number(targetUserId);
  if (!viewer?.id || !Number.isInteger(targetId) || targetId <= 0) return false;
  if (Number(viewer.id) === targetId) return false;

  // getAuthedUser() already rejects inactive viewers and omits isActive from
  // the returned object — only re-check the target here.
  const target = await db.User.findByPk(targetId, {
    attributes: ["id", "isActive"],
  });
  if (!target || !target.isActive) return false;
  return true;
}

/**
 * Load a conversation the viewer may access.
 * Admins can open any conversation (oversight); others must be a participant.
 */
export async function getConversationForUser(conversationId, user, { forWrite = false } = {}) {
  const id = Number(conversationId);
  const uid = Number(user?.id);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(uid) || uid <= 0) {
    return null;
  }

  const conversation = await db.Conversation.findByPk(id);
  if (!conversation) return null;

  const participant = isConversationParticipant(conversation, uid);
  if (participant) {
    return { conversation, isParticipant: true, isOversight: false };
  }

  // Admin oversight is read-only — cannot send into others' DMs
  if (isAdminRole(user.role) && !forWrite) {
    return { conversation, isParticipant: false, isOversight: true };
  }

  return null;
}

export async function findOrCreateDm(viewerId, recipientUserId) {
  const pair = canonicalDmPair(viewerId, recipientUserId);
  if (!pair) {
    return { error: "Invalid recipient", status: 400 };
  }

  const [conversation] = await db.Conversation.findOrCreate({
    where: pair,
    defaults: {
      ...pair,
      lastMessageAt: null,
    },
  });

  const now = new Date();
  await Promise.all([
    db.ConversationParticipant.findOrCreate({
      where: { conversationId: conversation.id, userId: Number(viewerId) },
      defaults: {
        conversationId: conversation.id,
        userId: Number(viewerId),
        lastReadAt: now,
      },
    }),
    db.ConversationParticipant.findOrCreate({
      where: { conversationId: conversation.id, userId: Number(recipientUserId) },
      defaults: {
        conversationId: conversation.id,
        userId: Number(recipientUserId),
        lastReadAt: null,
      },
    }),
  ]);

  return { conversation };
}

export function serializeMessage(message) {
  const plain = typeof message.toJSON === "function" ? message.toJSON() : message;
  const author = plain.author || null;
  return {
    id: plain.id,
    conversationId: plain.conversationId,
    userId: plain.userId,
    body: plain.body,
    createdAt: plain.createdAt,
    author: author
      ? { id: author.id, username: author.username, role: author.role }
      : null,
  };
}

export function serializeContact(user, now = Date.now()) {
  const presence = derivePresence(
    {
      id: user.id,
      activeSessionId: user.activeSessionId,
      activeSessionLastSeenAt: user.activeSessionLastSeenAt,
    },
    now,
  );
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    presence: presence.status,
    lastActiveAt: presence.lastActiveAt,
  };
}

function unknownContact(id) {
  return {
    id: id ?? null,
    username: "Unknown",
    role: null,
    presence: "offline",
    lastActiveAt: null,
  };
}

export async function listContacts(viewerId) {
  const users = await db.User.findAll({
    where: {
      isActive: true,
      id: { [Op.ne]: Number(viewerId) },
    },
    attributes: ["id", "username", "role", "activeSessionId", "activeSessionLastSeenAt"],
    order: [["username", "ASC"]],
  });
  const now = Date.now();
  return users.map((u) => serializeContact(u, now));
}

async function loadPeerUsers(peerIds) {
  if (!peerIds.length) return new Map();
  const users = await db.User.findAll({
    where: { id: { [Op.in]: peerIds } },
    attributes: ["id", "username", "role", "activeSessionId", "activeSessionLastSeenAt", "isActive"],
  });
  return new Map(users.map((u) => [u.id, u]));
}

async function loadLastMessages(conversationIds) {
  if (!conversationIds.length) return new Map();

  const messages = await db.Message.findAll({
    where: { conversationId: { [Op.in]: conversationIds } },
    include: [
      {
        model: db.User,
        as: "author",
        attributes: ["id", "username", "role"],
        required: false,
      },
    ],
    order: [
      ["conversationId", "ASC"],
      ["id", "DESC"],
    ],
  });

  const byConv = new Map();
  for (const msg of messages) {
    if (!byConv.has(msg.conversationId)) {
      byConv.set(msg.conversationId, msg);
    }
  }
  return byConv;
}

async function countUnread(conversationId, userId, lastReadAt) {
  const where = {
    conversationId,
    userId: { [Op.ne]: Number(userId) },
  };
  if (lastReadAt) {
    where.createdAt = { [Op.gt]: lastReadAt };
  }
  return db.Message.count({ where });
}

function serializeInboxItem({
  conversation,
  peer,
  peers,
  lastMessage,
  unreadCount,
  isOversight,
  now,
}) {
  if (isOversight && peers) {
    const [a, b] = peers;
    const label = `${a?.username || "Unknown"} ↔ ${b?.username || "Unknown"}`;
    return {
      id: conversation.id,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: 0,
      isOversight: true,
      canSend: false,
      peer: {
        id: null,
        username: label,
        role: null,
        presence: "offline",
        lastActiveAt: null,
      },
      participants: peers.map((p) => (p ? serializeContact(p, now) : unknownContact())),
      lastMessage: lastMessage ? serializeMessage(lastMessage) : null,
    };
  }

  return {
    id: conversation.id,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount,
    isOversight: false,
    canSend: true,
    peer: peer
      ? serializeContact(peer, now)
      : unknownContact(peer?.id),
    participants: null,
    lastMessage: lastMessage ? serializeMessage(lastMessage) : null,
  };
}

/** Personal inbox — only conversations the user participates in (admins included). */
export async function listConversationsForUser(user) {
  const uid = Number(user.id);

  const conversations = await db.Conversation.findAll({
    where: {
      [Op.or]: [{ dmUserLowId: uid }, { dmUserHighId: uid }],
    },
    order: [
      [db.sequelize.literal("`lastMessageAt` IS NULL"), "ASC"],
      ["lastMessageAt", "DESC"],
      ["id", "DESC"],
    ],
  });

  if (!conversations.length) {
    return { conversations: [], totalUnread: 0 };
  }

  const conversationIds = conversations.map((c) => c.id);
  const peerIds = conversations.map((c) => otherDmUserId(c, uid)).filter(Boolean);
  const [usersById, lastMessages, participants] = await Promise.all([
    loadPeerUsers(peerIds),
    loadLastMessages(conversationIds),
    db.ConversationParticipant.findAll({
      where: { conversationId: { [Op.in]: conversationIds }, userId: uid },
    }),
  ]);

  const participantByConv = new Map(participants.map((p) => [p.conversationId, p]));
  const now = Date.now();
  let totalUnread = 0;

  const serialized = [];
  for (const conversation of conversations) {
    const peerId = otherDmUserId(conversation, uid);
    const peer = usersById.get(peerId) || null;
    const lastMessage = lastMessages.get(conversation.id) || null;
    const participant = participantByConv.get(conversation.id);
    const unreadCount = await countUnread(
      conversation.id,
      uid,
      participant?.lastReadAt || null,
    );
    totalUnread += unreadCount;

    serialized.push(
      serializeInboxItem({
        conversation,
        peer,
        lastMessage,
        unreadCount,
        isOversight: false,
        now,
      }),
    );
  }

  return { conversations: serialized, totalUnread };
}

/**
 * Admin-only: every DM on the system for oversight (read-only).
 * Excludes empty conversations with no messages by default via lastMessageAt sort.
 */
export async function listAllConversationsForAdmin(adminUser) {
  if (!isAdminRole(adminUser?.role)) {
    return { error: "Forbidden", status: 403 };
  }

  const conversations = await db.Conversation.findAll({
    order: [
      [db.sequelize.literal("`lastMessageAt` IS NULL"), "ASC"],
      ["lastMessageAt", "DESC"],
      ["id", "DESC"],
    ],
  });

  if (!conversations.length) {
    return { conversations: [] };
  }

  const conversationIds = conversations.map((c) => c.id);
  const userIds = new Set();
  for (const c of conversations) {
    userIds.add(Number(c.dmUserLowId));
    userIds.add(Number(c.dmUserHighId));
  }

  const [usersById, lastMessages] = await Promise.all([
    loadPeerUsers([...userIds]),
    loadLastMessages(conversationIds),
  ]);

  const now = Date.now();
  const serialized = conversations.map((conversation) => {
    const low = usersById.get(Number(conversation.dmUserLowId)) || null;
    const high = usersById.get(Number(conversation.dmUserHighId)) || null;
    const lastMessage = lastMessages.get(conversation.id) || null;
    return serializeInboxItem({
      conversation,
      peers: [low, high],
      lastMessage,
      unreadCount: 0,
      isOversight: true,
      now,
    });
  });

  return { conversations: serialized };
}

export async function getTotalUnreadForUser(user) {
  const { totalUnread } = await listConversationsForUser(user);
  return totalUnread;
}

export async function markConversationRead(conversationId, userId) {
  const now = new Date();
  const [participant] = await db.ConversationParticipant.findOrCreate({
    where: { conversationId: Number(conversationId), userId: Number(userId) },
    defaults: {
      conversationId: Number(conversationId),
      userId: Number(userId),
      lastReadAt: now,
    },
  });

  if (participant.lastReadAt == null || new Date(participant.lastReadAt) < now) {
    await participant.update({ lastReadAt: now });
  }

  return participant;
}

export async function listMessages(conversationId, { beforeId = null, limit = 50 } = {}) {
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const where = { conversationId: Number(conversationId) };
  if (beforeId != null) {
    const bid = Number(beforeId);
    if (Number.isInteger(bid) && bid > 0) {
      where.id = { [Op.lt]: bid };
    }
  }

  const rows = await db.Message.findAll({
    where,
    include: [
      {
        model: db.User,
        as: "author",
        attributes: ["id", "username", "role"],
        required: false,
      },
    ],
    order: [["id", "DESC"]],
    limit: capped,
  });

  // Return chronological (oldest → newest) for the UI
  return rows.reverse().map(serializeMessage);
}

export async function createMessage(conversation, authorUser, body) {
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) {
    return { error: "Message body is required", status: 400 };
  }
  if (text.length > 5000) {
    return { error: "Message is too long (max 5000 characters)", status: 400 };
  }

  if (!isConversationParticipant(conversation, authorUser.id)) {
    return { error: "Cannot send messages in this conversation", status: 403 };
  }

  const message = await db.Message.create({
    conversationId: conversation.id,
    userId: authorUser.id,
    body: text,
  });

  const now = new Date();
  await conversation.update({ lastMessageAt: now });
  await markConversationRead(conversation.id, authorUser.id);

  const withAuthor = await db.Message.findByPk(message.id, {
    include: [
      {
        model: db.User,
        as: "author",
        attributes: ["id", "username", "role"],
        required: false,
      },
    ],
  });

  return { message: serializeMessage(withAuthor) };
}
