"use client";

import { useState } from "react";
import { deleteFileImage, fetchFileAttachmentDownloadUrl } from "@/lib/fileAttachments";
import { isImageAttachment } from "@/lib/messageAttachments";

function FileImagePreview({ attachment, canManageImages, isAdmin, busy, onDownload, onRemove }) {
  const [error, setError] = useState(null);
  const src = `/api/files/attachments/${attachment.id}/file?disposition=inline`;

  return (
    <figure className="group relative mt-4">
      {error ? (
        <div className="flex min-h-32 items-center justify-center border border-dashed border-zinc-200 text-xs text-rose-600 dark:border-zinc-700 dark:text-rose-300">
          {error}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={attachment.originalName}
          className="max-h-[28rem] w-full object-contain"
          onError={() => setError("This image is no longer available. It may have been removed from storage.")}
        />
      )}
      {isAdmin || canManageImages ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="min-w-0 truncate">{attachment.originalName}</span>
          <span className="min-w-0 flex-1" />
          {isAdmin ? (
            <button
              type="button"
              onClick={() => onDownload(attachment)}
              disabled={busy}
              className="font-semibold text-zinc-600 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              {busy ? "…" : "Download"}
            </button>
          ) : null}
          {canManageImages ? (
            <button
              type="button"
              onClick={() => onRemove(attachment)}
              disabled={busy}
              className="font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-50 dark:text-rose-300 dark:hover:text-rose-200"
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}

export default function FileAttachmentPanel({
  attachments = [],
  canManageImages = false,
  isAdmin = false,
  onAttachmentsChange,
}) {
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const attached = Array.isArray(attachments) ? attachments : [];

  async function onDownload(attachment) {
    if (busyId) return;
    setBusyId(attachment.id);
    setError(null);
    try {
      const url = await fetchFileAttachmentDownloadUrl(attachment.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err?.message || "Failed to download image");
    } finally {
      setBusyId(null);
    }
  }

  async function onRemove(attachment) {
    if (busyId) return;
    setBusyId(attachment.id);
    setError(null);
    try {
      await deleteFileImage(attachment.id);
      onAttachmentsChange?.((prev) => (Array.isArray(prev) ? prev : []).filter((item) => item.id !== attachment.id));
    } catch (err) {
      setError(err?.message || "Failed to remove image");
    } finally {
      setBusyId(null);
    }
  }

  if (!attached.length) return null;

  return (
    <div className="mt-2">
      {error ? <p className="mb-2 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
      {attached.map((attachment) =>
        isImageAttachment(attachment.mimeType) ? (
          <FileImagePreview
            key={attachment.id}
            attachment={attachment}
            canManageImages={canManageImages}
            isAdmin={isAdmin}
            busy={busyId === attachment.id}
            onDownload={onDownload}
            onRemove={onRemove}
          />
        ) : (
          <p key={attachment.id} className="mt-3 text-sm text-zinc-700 dark:text-zinc-200">
            {attachment.originalName}
          </p>
        ),
      )}
    </div>
  );
}
