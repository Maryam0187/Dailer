"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBytes } from "@/lib/messageAttachments";

const PAGE_SIZE = 25;

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function formatSize(sizeBytes) {
  const label = formatBytes(sizeBytes);
  if (label) return label;
  const value = Number(sizeBytes);
  if (Number.isFinite(value) && value === 0) return "0 B";
  return "—";
}

function statusTone(status) {
  if (status === "deleted") {
    return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200";
}

export default function MessageAttachmentsAdminClient() {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const load = useCallback(async (nextPage = 1) => {
    const target = Number.isInteger(nextPage) && nextPage > 0 ? nextPage : 1;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/messages/admin/attachments?page=${target}&pageSize=${PAGE_SIZE}`,
        { credentials: "include", cache: "no-store" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load attachments");
      setRows(Array.isArray(json.attachments) ? json.attachments : []);
      const p = json.pagination || {};
      const safePage = Number(p.page) || target;
      setPage(safePage);
      setPagination({
        page: safePage,
        pageSize: Number(p.pageSize) || PAGE_SIZE,
        total: Number(p.total) || 0,
        totalPages: Number(p.totalPages) || 1,
        hasNext: Boolean(p.hasNext),
        hasPrev: Boolean(p.hasPrev),
      });
    } catch (err) {
      setError(err?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  async function onDownload(attachment) {
    if (attachment.status !== "attached" || downloadingId) return;
    setDownloadingId(attachment.id);
    setError(null);
    try {
      const res = await fetch(`/api/messages/attachments/${attachment.id}/download-url`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to get download link");
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err?.message || "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  const showingFrom = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const showingTo = Math.min(pagination.page * pagination.pageSize, pagination.total);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {pagination.total > 0
            ? `Showing ${showingFrom}–${showingTo} of ${pagination.total} files`
            : "No chat attachments yet."}
        </p>
        <button
          type="button"
          onClick={() => void load(page)}
          disabled={loading}
          className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No attachment files have been shared in chat yet.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                  <th className="px-4 py-3 text-left">File</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Size</th>
                  <th className="px-4 py-3 text-left">Uploaded by</th>
                  <th className="px-4 py-3 text-left">Receiver</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Receiver download</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Uploaded</th>
                  <th className="px-4 py-3 text-right"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="max-w-[16rem] px-4 py-3">
                      <span
                        className="block truncate font-medium text-zinc-900 dark:text-zinc-100"
                        title={row.originalName}
                      >
                        {row.originalName || "—"}
                      </span>
                      {row.mimeType ? (
                        <span className="mt-0.5 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {row.mimeType}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                      {formatSize(row.sizeBytes)}
                    </td>
                    <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200">
                      {row.uploader?.username || "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200">
                      {row.receiver?.username || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.receiverDownloadedAt ? (
                        <div>
                          <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
                            Downloaded
                          </span>
                          <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                            {formatWhen(row.receiverDownloadedAt)}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300">
                          Not downloaded
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${statusTone(row.status)}`}
                      >
                        {row.status || "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatWhen(row.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.status === "attached" ? (
                        <button
                          type="button"
                          onClick={() => void onDownload(row)}
                          disabled={downloadingId === row.id}
                          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          {downloadingId === row.id ? "…" : "Download"}
                        </button>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              Page {pagination.page} / {pagination.totalPages}
              {pagination.total > 0 ? ` · ${pagination.pageSize} per page` : ""}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void load(page - 1)}
                disabled={!pagination.hasPrev || loading}
                className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => void load(page + 1)}
                disabled={!pagination.hasNext || loading}
                className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
