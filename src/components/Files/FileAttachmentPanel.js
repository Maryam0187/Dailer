"use client";

import { useEffect, useRef, useState } from "react";
import { AttachFileIcon, PendingAttachmentList } from "@/components/Messaging/MessageAttachmentParts";
import {
  deleteFileImage,
  fetchFileAttachmentDownloadUrl,
  fetchFileAttachmentPreviewUrl,
  uploadFileImage,
} from "@/lib/fileAttachments";
import { formatBytes, formatAllowedAttachmentTypesLabel, isImageAttachment } from "@/lib/messageAttachments";

function FileImagePreview({ attachment }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function ensureSrc() {
    if (src || loading) return;
    setLoading(true);
    setError(null);
    try {
      const url = await fetchFileAttachmentPreviewUrl(attachment.id);
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
      className="block overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/60"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={attachment.originalName}
          className="max-h-56 max-w-full object-contain"
          onError={() => {
            setSrc(null);
            setError("This image is no longer available. It may have been removed from storage.");
          }}
        />
      ) : (
        <div
          className={`flex min-h-24 min-w-[10rem] items-center justify-center px-4 py-6 text-xs ${
            error ? "text-rose-600 dark:text-rose-300" : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {loading ? "Loading image…" : error || "Tap to preview"}
        </div>
      )}
    </button>
  );
}

export default function FileAttachmentPanel({
  fileId = null,
  attachments = [],
  canManageImages = false,
  isAdmin = false,
  isNewFile = false,
  onAttachmentsChange,
}) {
  const inputRef = useRef(null);
  const [config, setConfig] = useState(null);
  const [pending, setPending] = useState([]);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!canManageImages) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/files/attachments/config", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setConfig({
            mimeTypes: Array.isArray(data.mimeTypes) ? data.mimeTypes : [],
            mimeTypeSet: new Set(Array.isArray(data.mimeTypes) ? data.mimeTypes : []),
            accept: typeof data.accept === "string" ? data.accept : ".jpg,.jpeg,.png,.gif,.webp",
            maxSizeBytes: Number(data.maxSizeBytes) || 10 * 1024 * 1024,
            maxAttachmentsPerFile: Number(data.maxAttachmentsPerFile) || 5,
          });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManageImages]);

  const attached = Array.isArray(attachments) ? attachments : [];
  const maxCount = config?.maxAttachmentsPerFile ?? 5;
  const accept = config?.accept || ".jpg,.jpeg,.png,.gif,.webp";
  const typesLabel = formatAllowedAttachmentTypesLabel(accept, ".jpg, .jpeg, .png, .gif, .webp");
  const readyCount = attached.length + pending.filter((item) => item.uploading || item.id).length;

  async function uploadSelectedFile(file) {
    if (!fileId || !file) return;
    const localKey = `${Date.now()}-${file.name}`;
    setPending((prev) => [
      ...prev,
      {
        localKey,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        uploading: true,
        error: null,
        id: null,
      },
    ]);
    setError(null);

    try {
      const attachment = await uploadFileImage({
        file,
        fileId,
        config,
        currentCount: attached.length + pending.filter((item) => item.id && !item.error).length,
      });
      setPending((prev) => prev.filter((item) => item.localKey !== localKey));
      if (attachment) {
        onAttachmentsChange?.((prev) => {
          const list = Array.isArray(prev) ? prev : [];
          if (list.some((item) => item.id === attachment.id)) return list;
          return [...list, attachment];
        });
      }
    } catch (err) {
      const message =
        err?.message === "Failed to fetch"
          ? "Upload failed — could not reach the server"
          : err?.message || "Upload failed";
      setPending((prev) =>
        prev.map((item) =>
          item.localKey === localKey ? { ...item, uploading: false, error: message } : item,
        ),
      );
      setError(message);
    }
  }

  function onFilesSelected(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!config) {
      setError("Attachment settings are still loading");
      return;
    }
    const slotsLeft = maxCount - readyCount;
    if (slotsLeft <= 0) {
      setError(`You can attach up to ${maxCount} images per file`);
      return;
    }
    files.slice(0, slotsLeft).forEach((file) => {
      void uploadSelectedFile(file);
    });
    if (files.length > slotsLeft) {
      setError(`You can attach up to ${maxCount} images per file`);
    }
  }

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

  function onRemovePending(localKey) {
    setPending((prev) => prev.filter((item) => item.localKey !== localKey));
  }

  const showPanel = attached.length > 0 || canManageImages || (isNewFile && isAdmin);
  if (!showPanel) return null;

  return (
    <div className="border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950 sm:px-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Images
        </p>
        <div className="min-w-0 flex-1" />
        {isNewFile && isAdmin ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Save the file to attach images.</p>
        ) : canManageImages ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              multiple
              className="hidden"
              onChange={onFilesSelected}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={!config || readyCount >= maxCount}
              title={`Attach image (${typesLabel})`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <AttachFileIcon className="h-3.5 w-3.5" />
              Add image
            </button>
          </>
        ) : null}
      </div>

      {canManageImages && !isNewFile ? (
        <p className="mb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          {typesLabel} · up to {maxCount} images
        </p>
      ) : null}

      {error ? <p className="mb-2 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}

      <PendingAttachmentList items={pending} onRemove={onRemovePending} />

      {attached.length > 0 ? (
        <div className="space-y-3">
          {attached.map((attachment) => (
            <div key={attachment.id}>
              {isImageAttachment(attachment.mimeType) ? (
                <FileImagePreview attachment={attachment} />
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                  <p className="truncate font-medium text-zinc-800 dark:text-zinc-100">
                    {attachment.originalName}
                  </p>
                  <p className="text-zinc-500 dark:text-zinc-400">{formatBytes(attachment.sizeBytes)}</p>
                </div>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => void onDownload(attachment)}
                    disabled={busyId === attachment.id}
                    className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {busyId === attachment.id ? "…" : "Download"}
                  </button>
                ) : null}
                {canManageImages ? (
                  <button
                    type="button"
                    onClick={() => void onRemove(attachment)}
                    disabled={busyId === attachment.id}
                    className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : !isNewFile && !pending.length ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">No images attached.</p>
      ) : null}
    </div>
  );
}
