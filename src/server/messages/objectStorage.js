import { randomUUID } from "node:crypto";
import { HeadObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  PRESIGN_DOWNLOAD_EXPIRY_SEC,
  PRESIGN_UPLOAD_EXPIRY_SEC,
} from "@/server/messages/attachmentConfig";

let cachedClient = null;

export function isObjectStorageConfigured() {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY &&
      process.env.S3_BUCKET_NAME,
  );
}

function getBucketName() {
  const bucket = String(process.env.S3_BUCKET_NAME || "").trim();
  if (!bucket) {
    throw new Error("S3_BUCKET_NAME is not configured");
  }
  return bucket;
}

export function getS3Client() {
  if (!isObjectStorageConfigured()) {
    throw new Error("Object storage is not configured");
  }
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    });
  }
  return cachedClient;
}

export function sanitizeAttachmentFilename(name, fallback = "file") {
  const base = String(name || "")
    .split(/[/\\]/)
    .pop()
    .trim()
    .replace(/[^\w.\- ()[\]]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return base || fallback;
}

export function buildMessageAttachmentStorageKey(conversationId, originalName) {
  const safeName = sanitizeAttachmentFilename(originalName);
  return `messages/${Number(conversationId)}/${randomUUID()}-${safeName}`;
}

export async function createPresignedUploadUrl({ storageKey, mimeType, sizeBytes }) {
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
    ContentType: mimeType,
    ContentLength: sizeBytes,
  });
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: PRESIGN_UPLOAD_EXPIRY_SEC,
  });
  return { uploadUrl, expiresIn: PRESIGN_UPLOAD_EXPIRY_SEC };
}

export async function createPresignedDownloadUrl({ storageKey, originalName, mimeType }) {
  const client = getS3Client();
  const safeName = sanitizeAttachmentFilename(originalName, "download");
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
    ResponseContentType: mimeType,
    ResponseContentDisposition: `attachment; filename="${safeName}"`,
  });
  const downloadUrl = await getSignedUrl(client, command, {
    expiresIn: PRESIGN_DOWNLOAD_EXPIRY_SEC,
  });
  return { downloadUrl, expiresIn: PRESIGN_DOWNLOAD_EXPIRY_SEC };
}

export async function writeObjectAttachment(storageKey, data, mimeType) {
  const client = getS3Client();
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
  await client.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: storageKey,
      Body: body,
      ContentType: mimeType,
      ContentLength: body.length,
    }),
  );
}

export async function headObjectMetadata(storageKey) {
  const client = getS3Client();
  const result = await client.send(
    new HeadObjectCommand({
      Bucket: getBucketName(),
      Key: storageKey,
    }),
  );
  return {
    sizeBytes: Number(result.ContentLength) || 0,
    mimeType: String(result.ContentType || "").trim(),
  };
}
