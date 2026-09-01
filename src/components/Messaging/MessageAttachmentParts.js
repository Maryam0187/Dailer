"use client";

import { useState } from "react";
import { formatBytes, isImageAttachment } from "@/lib/messageAttachments";

async function fetchDownloadUrl(attachmentId) {
  const res = await fetch(`/api/messages/attachments/${attachmentId}/download-url`, {
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to get download link");
  }
  return data.downloadUrl;
}

export function AttachFileIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function AttachmentIcon({ className = "h-4 w-4" }) {
  return <AttachFileIcon className={className} />;
}

function MessageImagePreview({ attachment, mine }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function ensureSrc() {
    if (src || loading) return;
    setLoading(true);
    setError(null);
    try {
      const url = await fetchDownloadUrl(attachment.id);
      setSrc(url);
    } catch (err) {
      setError(err?.message || "Could not load image");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void ensureSrc()}
      className={`block overflow-hidden rounded-xl border ${
        mine
          ? "border-sky-500/40 bg-sky-500/10"
          : "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/60"
      }`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={attachment.originalName} className="max-h-56 max-w-full object-contain" />
      ) : (
        <div className="flex min-h-24 min-w-[10rem] items-center justify-center px-4 py-6 text-xs">
          {loading ? "Loading image…" : error || "Tap to preview"}
        </div>
      )}
    </button>
  );
}

export function MessageAttachmentList({ attachments, mine = false }) {
  const [downloadingId, setDownloadingId] = useState(null);

  if (!Array.isArray(attachments) || attachments.length === 0) return null;

  async function onDownload(attachment) {
    if (downloadingId) return;
    setDownloadingId(attachment.id);
    try {
      const url = await fetchDownloadUrl(attachment.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {attachments.map((attachment) => (
        <div key={attachment.id}>
          {isImageAttachment(attachment.mimeType) ? (
            <MessageImagePreview attachment={attachment} mine={mine} />
          ) : null}
          <button
            type="button"
            onClick={() => void onDownload(attachment)}
            disabled={downloadingId === attachment.id}
            className={`mt-2 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
              mine
                ? "border-sky-400/40 bg-sky-500/15 text-sky-50 hover:bg-sky-500/25"
                : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <AttachmentIcon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{attachment.originalName}</span>
              <span className={mine ? "text-sky-100/80" : "text-zinc-500 dark:text-zinc-400"}>
                {formatBytes(attachment.sizeBytes)}
              </span>
            </span>
            <span className="shrink-0 font-semibold">
              {downloadingId === attachment.id ? "…" : "Download"}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

export function PendingAttachmentList({ items, onRemove }) {
  if (!items.length) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2 px-1">
      {items.map((item) => (
        <div
          key={item.localKey}
          className="inline-flex max-w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          <AttachmentIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          <span className="min-w-0 truncate font-medium text-zinc-800 dark:text-zinc-100">
            {item.originalName}
          </span>
          <span className="shrink-0 text-zinc-400">
            {item.uploading ? "Uploading…" : item.error ? "Failed" : formatBytes(item.sizeBytes)}
          </span>
          {!item.uploading ? (
            <button
              type="button"
              onClick={() => onRemove(item.localKey)}
              className="shrink-0 rounded-md px-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              aria-label={`Remove ${item.originalName}`}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
