import { Op } from "sequelize";
import db from "@/server/db";
import {
  getAllowedAttachmentMimeTypes,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from "@/server/messages/attachmentConfig";
import {
  createDownloadTarget,
  createUploadTarget,
  headStoredAttachment,
  isAttachmentStorageAvailable,
} from "@/server/messages/attachmentStorage";
import {
  buildMessageAttachmentStorageKey,
  sanitizeAttachmentFilename,
} from "@/server/messages/objectStorage";

export function serializeAttachment(attachment) {
  const plain = typeof attachment.toJSON === "function" ? attachment.toJSON() : attachment;
  return {
    id: plain.id,
    messageId: plain.messageId,
    conversationId: plain.conversationId,
    originalName: plain.originalName,
    mimeType: plain.mimeType,
    sizeBytes: plain.sizeBytes,
    status: plain.status,
    createdAt: plain.createdAt,
    receiverDownloadedAt: plain.receiverDownloadedAt || null,
  };
}

function serializeUserBrief(user) {
  if (!user) return null;
  const plain = typeof user.toJSON === "function" ? user.toJSON() : user;
  return {
    id: plain.id,
    username: plain.username || "Unknown",
  };
}

function receiverFromConversation(conversation, uploaderId) {
  if (!conversation) return null;
  const uid = Number(uploaderId);
  if (Number(conversation.dmUserLowId) === uid) {
    return serializeUserBrief(conversation.dmUserHigh);
  }
  if (Number(conversation.dmUserHighId) === uid) {
    return serializeUserBrief(conversation.dmUserLow);
  }
  return null;
}

/**
 * Admin-only inventory of chat attachment files with uploader + DM receiver.
 * Kept here (not messageAccess) to avoid a circular import with that module.
 */
export async function listAttachmentsForAdmin(adminUser, { page = 1, pageSize = 25 } = {}) {
  if (adminUser?.role !== "admin") {
    return { error: "Forbidden", status: 403 };
  }

  const limit = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const requestedPage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;

  const where = {
    status: { [Op.in]: ["attached", "deleted"] },
  };

  const total = await db.MessageAttachment.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(requestedPage, totalPages);
  const offset = (safePage - 1) * limit;

  const rows = await db.MessageAttachment.findAll({
    where,
    include: [
      {
        model: db.User,
        as: "uploader",
        attributes: ["id", "username"],
        required: false,
      },
      {
        model: db.Conversation,
        as: "conversation",
        attributes: ["id", "dmUserLowId", "dmUserHighId"],
        required: false,
        include: [
          {
            model: db.User,
            as: "dmUserLow",
            attributes: ["id", "username"],
            required: false,
          },
          {
            model: db.User,
            as: "dmUserHigh",
            attributes: ["id", "username"],
            required: false,
          },
        ],
      },
    ],
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
    limit,
    offset,
  });

  const attachments = rows.map((row) => {
    const plain = typeof row.toJSON === "function" ? row.toJSON() : row;
    return {
      id: plain.id,
      messageId: plain.messageId,
      conversationId: plain.conversationId,
      originalName: plain.originalName,
      mimeType: plain.mimeType,
      sizeBytes: plain.sizeBytes,
      status: plain.status,
      createdAt: plain.createdAt,
      receiverDownloadedAt: plain.receiverDownloadedAt || null,
      uploader: serializeUserBrief(plain.uploader),
      receiver: receiverFromConversation(plain.conversation, plain.userId),
    };
  });

  return {
    attachments,
    pagination: {
      page: safePage,
      pageSize: limit,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
    },
  };
}

export function isImageMimeType(mimeType) {
  return String(mimeType || "").toLowerCase().startsWith("image/");
}

function normalizeMimeType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(";")[0];
}

function validateUploadInput({ filename, mimeType, sizeBytes }) {
  const normalizedMime = normalizeMimeType(mimeType);
  if (!getAllowedAttachmentMimeTypes().has(normalizedMime)) {
    return { error: "File type is not allowed", status: 400 };
  }

  const size = Number(sizeBytes);
  if (!Number.isInteger(size) || size <= 0) {
    return { error: "Invalid file size", status: 400 };
  }
  if (size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      error: `File is too large (max ${Math.round(MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024))} MB)`,
      status: 400,
    };
  }

  const originalName = sanitizeAttachmentFilename(filename);
  if (!originalName) {
    return { error: "Filename is required", status: 400 };
  }

  return { originalName, mimeType: normalizedMime, sizeBytes: size };
}

export async function createPendingAttachmentUpload({
  conversationId,
  userId,
  filename,
  mimeType,
  sizeBytes,
}) {
  if (!isAttachmentStorageAvailable()) {
    return { error: "File attachments are not configured on this server", status: 503 };
  }

  const id = Number(conversationId);
  const uid = Number(userId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(uid) || uid <= 0) {
    return { error: "Invalid conversation", status: 400 };
  }

  const validated = validateUploadInput({ filename, mimeType, sizeBytes });
  if (validated.error) {
    return validated;
  }

  const storageKey = buildMessageAttachmentStorageKey(id, validated.originalName);
  const attachment = await db.MessageAttachment.create({
    conversationId: id,
    messageId: null,
    userId: uid,
    storageKey,
    originalName: validated.originalName,
    mimeType: validated.mimeType,
    sizeBytes: validated.sizeBytes,
    status: "pending",
  });

  const uploadTarget = await createUploadTarget({
    attachmentId: attachment.id,
    storageKey,
    mimeType: validated.mimeType,
    sizeBytes: validated.sizeBytes,
  });

  return {
    attachment: serializeAttachment(attachment),
    uploadUrl: uploadTarget.uploadUrl,
    uploadMode: uploadTarget.mode,
    expiresIn: uploadTarget.expiresIn,
  };
}

async function verifyPendingAttachmentInStorage(attachment) {
  try {
    const meta = await headStoredAttachment(attachment.storageKey);
    if (meta.sizeBytes !== Number(attachment.sizeBytes)) {
      return { error: `Upload incomplete for ${attachment.originalName}`, status: 400 };
    }
    const expectedMime = normalizeMimeType(attachment.mimeType);
    const actualMime = normalizeMimeType(meta.mimeType);
    if (actualMime && expectedMime && actualMime !== expectedMime) {
      return { error: `Uploaded file type mismatch for ${attachment.originalName}`, status: 400 };
    }
    return null;
  } catch {
    return { error: `File was not uploaded for ${attachment.originalName}`, status: 400 };
  }
}

export async function linkAttachmentsToMessage({
  conversationId,
  userId,
  messageId,
  attachmentIds,
  transaction,
}) {
  const convId = Number(conversationId);
  const uid = Number(userId);
  const msgId = Number(messageId);
  const ids = [...new Set((attachmentIds || []).map((value) => Number(value)).filter((n) => n > 0))];

  if (ids.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return {
      error: `Too many attachments (max ${MAX_ATTACHMENTS_PER_MESSAGE})`,
      status: 400,
    };
  }

  if (!ids.length) {
    return { attachments: [] };
  }

  const rows = await db.MessageAttachment.findAll({
    where: {
      id: ids,
      conversationId: convId,
      userId: uid,
      status: "pending",
      messageId: null,
    },
    transaction,
  });

  if (rows.length !== ids.length) {
    return { error: "One or more attachments are invalid or already used", status: 400 };
  }

  for (const attachment of rows) {
    const verifyError = await verifyPendingAttachmentInStorage(attachment);
    if (verifyError) {
      return verifyError;
    }
  }

  await db.MessageAttachment.update(
    { messageId: msgId, status: "attached" },
    {
      where: { id: ids },
      transaction,
    },
  );

  const attached = await db.MessageAttachment.findAll({
    where: { id: ids },
    order: [["id", "ASC"]],
    transaction,
  });

  return { attachments: attached.map(serializeAttachment) };
}

/**
 * Record first download/view by the DM receiver (not uploader, not admin oversight).
 */
export async function markAttachmentDownloadedByReceiver(attachment, viewer) {
  if (!attachment || !viewer?.id) return attachment;
  if (attachment.receiverDownloadedAt) return attachment;
  if (attachment.status !== "attached") return attachment;
  if (Number(attachment.userId) === Number(viewer.id)) return attachment;

  const conversation = await db.Conversation.findByPk(attachment.conversationId, {
    attributes: ["id", "dmUserLowId", "dmUserHighId"],
  });
  if (!conversation) return attachment;

  const viewerId = Number(viewer.id);
  const isParticipant =
    Number(conversation.dmUserLowId) === viewerId ||
    Number(conversation.dmUserHighId) === viewerId;
  if (!isParticipant) return attachment;

  await attachment.update({ receiverDownloadedAt: new Date() });
  return attachment;
}

export async function getAttachmentDownloadUrl(attachment) {
  if (!attachment || attachment.status !== "attached") {
    return { error: "Attachment not found", status: 404 };
  }

  if (!isAttachmentStorageAvailable()) {
    return { error: "File attachments are not configured on this server", status: 503 };
  }

  const downloadTarget = await createDownloadTarget(attachment);

  return {
    downloadUrl: downloadTarget.downloadUrl,
    expiresIn: downloadTarget.expiresIn,
    attachment: serializeAttachment(attachment),
  };
}
