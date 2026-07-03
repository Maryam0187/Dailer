"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RichTextEditor from "@/components/Leads/RichTextEditor";
import IconTooltipButton, { CloseIcon, DeleteIcon, EditIcon } from "@/components/Leads/IconTooltipButton";
import { isEmptyRichText, normalizeRichHtml, richTextPreview } from "@/lib/richText";
import FilesStatsPanel from "@/components/Files/FilesStatsPanel";

const MAX_OPEN_TABS = 5;
const FILES_PAGE_SIZE = 24;

const selectClass =
  "h-11 min-w-[200px] rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

const editorTitleClass =
  "min-w-0 flex-1 border-0 bg-transparent text-lg font-semibold text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-0 dark:text-zinc-100 dark:placeholder:text-zinc-500";

const browseTabClass = (active) =>
  `shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
    active
      ? "border-indigo-600 bg-indigo-100 text-indigo-950 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-100"
      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
  }`;

const fileTabClass = (active) =>
  `group flex max-w-[200px] shrink-0 items-center gap-1 rounded-xl border pl-3 pr-1.5 py-2 text-sm font-semibold transition-colors ${
    active
      ? "border-indigo-600 bg-indigo-100 text-indigo-950 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-100"
      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
  }`;

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatShortDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function createNewTab() {
  const snapshot = { fileName: "", content: "" };
  return {
    tabId: `new-${Date.now()}`,
    fileId: null,
    fileName: "",
    content: "",
    owner: null,
    saveError: null,
    savedSnapshot: snapshot,
  };
}

function snapshotFromTab(tab) {
  return {
    fileName: tab.fileName.trim(),
    content: normalizeRichHtml(tab.content),
  };
}

function isTabDirty(tab) {
  if (!tab?.savedSnapshot) return false;
  const current = snapshotFromTab(tab);
  return current.fileName !== tab.savedSnapshot.fileName || current.content !== tab.savedSnapshot.content;
}

function tabSnapshotFromFile(file) {
  return {
    fileName: file.name,
    content: normalizeRichHtml(file.content || ""),
  };
}

function tabLabel(tab) {
  const name = tab.fileName.trim();
  if (name) return name;
  return tab.fileId == null ? "New file" : "Untitled";
}

export default function FilesClient({ userRole = "agent", pageDescription = "", accessMode = "full" }) {
  const isAdmin = userRole === "admin";
  const isLimitedAfterShift = accessMode === "limited";
  const [files, setFiles] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: FILES_PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [viewAll, setViewAll] = useState(false);
  const [userFilter, setUserFilter] = useState("all");
  const [showDeleted, setShowDeleted] = useState(false);
  const [filterUsers, setFilterUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openTabs, setOpenTabs] = useState([]);
  const [activeView, setActiveView] = useState("browse");
  const [savingTabId, setSavingTabId] = useState(null);
  const [deletingTabId, setDeletingTabId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const [closeConfirm, setCloseConfirm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const openTabsRef = useRef(openTabs);
  openTabsRef.current = openTabs;
  const pageRef = useRef(page);
  pageRef.current = page;

  const activeEditorTab = openTabs.find((tab) => tab.tabId === activeView) ?? null;
  const isEditing = Boolean(activeEditorTab);
  const canOpenMore = openTabs.length < MAX_OPEN_TABS;
  const isStatsActive = activeView === "stats";
  const isBrowseActive = activeView === "browse";
  const isFilteringByUser = isAdmin && userFilter !== "all";
  const filteredUsername = filterUsers.find((user) => String(user.id) === userFilter)?.username ?? null;
  const isFilteredUserEmpty = isFilteringByUser && !loading && files.length === 0;

  const loadFiles = useCallback(
    async (targetPage = pageRef.current) => {
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("page", String(targetPage));
        params.set("pageSize", String(FILES_PAGE_SIZE));
        if (isAdmin && userFilter !== "all") {
          params.set("userId", userFilter);
        }
        if (isAdmin && showDeleted) {
          params.set("deleted", "true");
        }
        const res = await fetch(`/api/files?${params.toString()}`, { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load files");
        setFiles(json.files || []);
        setViewAll(Boolean(json.viewAll));
        if (json.pagination) {
          setPagination(json.pagination);
          setPage(json.pagination.page || targetPage);
        } else {
          setPagination({
            page: targetPage,
            pageSize: FILES_PAGE_SIZE,
            total: json.files?.length ?? 0,
            totalPages: 1,
            hasNext: false,
            hasPrev: targetPage > 1,
          });
        }
      } catch (err) {
        setError(err.message || "Failed to load files");
      } finally {
        setLoading(false);
      }
    },
    [isAdmin, userFilter, showDeleted],
  );

  useEffect(() => {
    setLoading(true);
    void loadFiles(page);
  }, [loadFiles, page]);

  useEffect(() => {
    if (!isEditing) return;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [isEditing]);

  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load users");
        if (!cancelled) setFilterUsers(json.users || []);
      } catch {
        if (!cancelled) setFilterUsers([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  function updateTab(tabId, updates) {
    setOpenTabs((tabs) => tabs.map((tab) => (tab.tabId === tabId ? { ...tab, ...updates } : tab)));
  }

  function showMaxTabsMessage() {
    setError(`You can open at most ${MAX_OPEN_TABS} files at once. Close a tab first.`);
  }

  function openNewFile() {
    if (isLimitedAfterShift) return;
    if (!canOpenMore) {
      showMaxTabsMessage();
      return;
    }
    const tab = createNewTab();
    setOpenTabs((tabs) => [...tabs, tab]);
    setActiveView(tab.tabId);
    setError(null);
  }

  function openEditFile(file) {
    const existing = openTabs.find((tab) => tab.fileId === file.id);
    if (existing) {
      setActiveView(existing.tabId);
      setError(null);
      return;
    }
    if (!canOpenMore) {
      showMaxTabsMessage();
      return;
    }
    const snapshot = tabSnapshotFromFile(file);
    const tab = {
      tabId: `file-${file.id}`,
      fileId: file.id,
      fileName: file.name,
      content: file.content || "",
      owner: file.owner || null,
      deleted: Boolean(file.deleted),
      saveError: null,
      savedSnapshot: snapshot,
    };
    setOpenTabs((tabs) => [...tabs, tab]);
    setActiveView(tab.tabId);
    setError(null);
  }

  useEffect(() => {
    if (!isLimitedAfterShift || loading || files.length === 0 || openTabs.length > 0) return;
    openEditFile(files[0]);
  }, [isLimitedAfterShift, loading, files, openTabs.length]);

  useEffect(() => {
    if (!isLimitedAfterShift || activeView !== "browse" || openTabs.length === 0) return;
    setActiveView(openTabs[0].tabId);
  }, [isLimitedAfterShift, activeView, openTabs]);

  function closeTab(tabId) {
    setOpenTabs((tabs) => {
      const remaining = tabs.filter((tab) => tab.tabId !== tabId);
      setActiveView((current) => {
        if (current !== tabId) return current;
        return remaining.length > 0 ? remaining[remaining.length - 1].tabId : "browse";
      });
      return remaining;
    });
    setCloseConfirm((current) => {
      if (!current) return null;
      if (current.tabId === tabId) return null;
      return current;
    });
  }

  function closeTabsForFile(fileId) {
    setOpenTabs((tabs) => {
      const remaining = tabs.filter((tab) => tab.fileId !== fileId);
      setActiveView((current) => {
        if (current === "browse") return current;
        if (remaining.some((tab) => tab.tabId === current)) return current;
        return remaining.length > 0 ? remaining[remaining.length - 1].tabId : "browse";
      });
      return remaining;
    });
  }

  function requestCloseTab(tabId) {
    if (isLimitedAfterShift) return;
    const tab = openTabs.find((t) => t.tabId === tabId);
    if (!tab) return;
    if (!isTabDirty(tab)) {
      closeTab(tabId);
      return;
    }
    setCloseConfirm({ tabId, label: tabLabel(tab) });
  }

  async function handleCloseConfirm(action) {
    if (!closeConfirm) return;
    const { tabId } = closeConfirm;

    if (action === "cancel") {
      setCloseConfirm(null);
      return;
    }

    if (action === "discard") {
      closeTab(tabId);
      setCloseConfirm(null);
      return;
    }

    const result = await saveTab(tabId, { closeAfterSave: true });
    if (result?.ok) {
      setCloseConfirm(null);
    }
  }

  async function saveTab(tabId, { closeAfterSave = false } = {}) {
    const tab = openTabsRef.current.find((t) => t.tabId === tabId);
    if (!tab) return { ok: false };

    const name = tab.fileName.trim();
    if (!name) {
      updateTab(tabId, { saveError: "File name is required" });
      return { ok: false };
    }

    setSavingTabId(tabId);
    updateTab(tabId, { saveError: null });

    try {
      const payload = {
        name,
        content: normalizeRichHtml(tab.content),
      };

      const url = tab.fileId ? `/api/files/${tab.fileId}` : "/api/files";
      const method = tab.fileId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save file");

      const saved = json.file;
      const newTabId = `file-${saved.id}`;
      const savedSnapshot = {
        fileName: saved.name,
        content: normalizeRichHtml(saved.content || ""),
      };
      setOpenTabs((tabs) =>
        tabs.map((t) =>
          t.tabId === tabId
            ? {
                ...t,
                tabId: newTabId,
                fileId: saved.id,
                fileName: saved.name,
                content: saved.content || "",
                owner: saved.owner || t.owner,
                saveError: null,
                savedSnapshot,
              }
            : t,
        ),
      );
      setActiveView((current) => (current === tabId ? newTabId : current));
      const reloadPage = tab.fileId ? pageRef.current : 1;
      if (!tab.fileId) setPage(1);
      await loadFiles(reloadPage);
      if (closeAfterSave) {
        closeTab(newTabId);
      }
      return { ok: true, tabId: newTabId };
    } catch (err) {
      updateTab(tabId, { saveError: err.message || "Failed to save file" });
      return { ok: false };
    } finally {
      setSavingTabId(null);
    }
  }

  function requestDeleteFile(file) {
    if (!file?.id) return;
    setDeleteConfirm({ id: file.id, name: file.name });
  }

  async function confirmDeleteFile() {
    if (!deleteConfirm) return;

    const file = { id: deleteConfirm.id, name: deleteConfirm.name };
    const openTab = openTabs.find((tab) => tab.fileId === file.id);
    if (openTab) {
      setDeletingTabId(openTab.tabId);
      updateTab(openTab.tabId, { saveError: null });
    } else {
      setDeletingId(file.id);
      setError(null);
    }

    try {
      const res = await fetch(`/api/files/${file.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to delete file");

      setDeleteConfirm(null);
      closeTabsForFile(file.id);
      await loadFiles(pageRef.current);
    } catch (err) {
      const message = err.message || "Failed to delete file";
      if (openTab) updateTab(openTab.tabId, { saveError: message });
      else setError(message);
    } finally {
      if (openTab) setDeletingTabId(null);
      else setDeletingId(null);
    }
  }

  async function restoreFile(file) {
    if (!file?.id) return;
    setRestoringId(file.id);
    setError(null);
    try {
      const res = await fetch(`/api/files/${file.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to restore file");

      const restored = json.file;
      if (restored) {
        const snapshot = tabSnapshotFromFile(restored);
        setOpenTabs((tabs) =>
          tabs.map((tab) =>
            tab.fileId === file.id
              ? {
                  ...tab,
                  fileName: restored.name,
                  content: restored.content || "",
                  owner: restored.owner || tab.owner,
                  deleted: false,
                  saveError: null,
                  savedSnapshot: snapshot,
                }
              : tab,
          ),
        );
      }

      await loadFiles(pageRef.current);
    } catch (err) {
      setError(err.message || "Failed to restore file");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div
      className={
        isEditing
          ? "flex h-[calc(100dvh-8.5rem)] flex-col overflow-hidden"
          : "flex flex-col gap-5"
      }
    >
      {!isEditing ? (
        <div className="mb-2 border-b border-zinc-200/80 pb-6 dark:border-zinc-800">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Files</h1>
          {pageDescription ? (
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
              {pageDescription}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={`flex flex-wrap items-center justify-between gap-3 ${isEditing ? "shrink-0" : ""}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
          {isLimitedAfterShift ? (
            <span className={browseTabClass(true)} aria-current="page">
              Assigned file
              {!loading ? (
                <span className="ml-1.5 rounded-full bg-indigo-200/80 px-1.5 py-0.5 text-[11px] font-bold text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-100">
                  {pagination.total}
                </span>
              ) : null}
            </span>
          ) : (
            <button type="button" onClick={() => setActiveView("browse")} className={browseTabClass(isBrowseActive)}>
              {showDeleted ? "Deleted files" : viewAll ? "All files" : "My files"}
              {!loading && isBrowseActive ? (
                <span className="ml-1.5 rounded-full bg-indigo-200/80 px-1.5 py-0.5 text-[11px] font-bold text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-100">
                  {pagination.total}
                </span>
              ) : null}
            </button>
          )}

          {isAdmin ? (
            <button type="button" onClick={() => setActiveView("stats")} className={browseTabClass(isStatsActive)}>
              File stats
            </button>
          ) : null}

          {!isLimitedAfterShift
            ? openTabs.map((tab) => {
            const active = activeView === tab.tabId;
            const dirty = isTabDirty(tab);
            return (
              <div key={tab.tabId} className={fileTabClass(active)}>
                <button
                  type="button"
                  onClick={() => setActiveView(tab.tabId)}
                  className="min-w-0 flex-1 truncate text-left"
                  title={dirty ? `${tabLabel(tab)} (unsaved changes)` : tabLabel(tab)}
                >
                  {dirty ? <span className="mr-1 text-indigo-600 dark:text-indigo-300">•</span> : null}
                  {tabLabel(tab)}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    requestCloseTab(tab.tabId);
                  }}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  aria-label={`Close ${tabLabel(tab)}`}
                  title="Close tab"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
            : null}

        </div>

        {isBrowseActive && !isFilteredUserEmpty && !isLimitedAfterShift && !showDeleted ? (
          <button
            type="button"
            onClick={openNewFile}
            disabled={!canOpenMore}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-lg leading-none">+</span>
            New file
          </button>
        ) : null}
      </div>

      {!isStatsActive && !canOpenMore ? (
        <p className={`text-xs text-zinc-500 dark:text-zinc-400 ${isEditing ? "shrink-0" : ""}`}>
          {MAX_OPEN_TABS} tabs open — close one to open another file.
        </p>
      ) : null}

      {error && !isStatsActive && !isEditing ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {isAdmin && isBrowseActive && !isLimitedAfterShift ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Filter by user
            <select
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value);
                setPage(1);
              }}
              className={`${selectClass} mt-1.5 block`}
            >
              <option value="all">All users</option>
              {filterUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => {
                setShowDeleted(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600"
            />
            Show deleted files
          </label>
        </div>
      ) : null}

      {isStatsActive ? <FilesStatsPanel /> : null}

      {isLimitedAfterShift && !loading && files.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
          No file has been assigned for your limited after-shift access.
        </div>
      ) : null}

      {isBrowseActive && !isLimitedAfterShift ? (
        <BrowseTab
          files={files}
          loading={loading}
          isAdmin={isAdmin}
          showDeleted={showDeleted}
          deletingId={deletingId}
          restoringId={restoringId}
          openFileIds={new Set(openTabs.map((tab) => tab.fileId).filter(Boolean))}
          canOpenMore={canOpenMore}
          filteringByUser={isFilteringByUser}
          filteredUsername={filteredUsername}
          pagination={pagination}
          onPrevPage={() => setPage((current) => Math.max(1, current - 1))}
          onNextPage={() => setPage((current) => current + 1)}
          onNewFile={openNewFile}
          onEditFile={openEditFile}
          onDeleteFile={requestDeleteFile}
          onRestoreFile={restoreFile}
        />
      ) : activeEditorTab ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <WriteTab
            tab={activeEditorTab}
            allowDelete={!isLimitedAfterShift && !activeEditorTab.deleted}
            allowClose={!isLimitedAfterShift}
            allowSave={!activeEditorTab.deleted}
            isDeleted={Boolean(activeEditorTab.deleted)}
            restoring={restoringId === activeEditorTab.fileId}
            saving={savingTabId === activeEditorTab.tabId}
            deleting={deletingTabId === activeEditorTab.tabId}
            onFileNameChange={(value) => updateTab(activeEditorTab.tabId, { fileName: value, saveError: null })}
            onContentChange={(value) => updateTab(activeEditorTab.tabId, { content: value, saveError: null })}
            onSave={() => saveTab(activeEditorTab.tabId, { closeAfterSave: false })}
            onDelete={() => requestDeleteFile({ id: activeEditorTab.fileId, name: activeEditorTab.fileName })}
            onRestore={() => restoreFile({ id: activeEditorTab.fileId, name: activeEditorTab.fileName })}
            onClose={() => requestCloseTab(activeEditorTab.tabId)}
          />
        </div>
      ) : null}

      {closeConfirm ? (
        <UnsavedChangesDialog
          fileName={closeConfirm.label}
          saving={savingTabId === closeConfirm.tabId}
          saveError={openTabs.find((tab) => tab.tabId === closeConfirm.tabId)?.saveError}
          onSave={() => handleCloseConfirm("save")}
          onDiscard={() => handleCloseConfirm("discard")}
          onCancel={() => handleCloseConfirm("cancel")}
        />
      ) : null}

      {deleteConfirm ? (
        <DeleteConfirmDialog
          fileName={deleteConfirm.name}
          deleting={
            deletingId === deleteConfirm.id ||
            openTabs.some((tab) => tab.fileId === deleteConfirm.id && tab.tabId === deletingTabId)
          }
          onConfirm={confirmDeleteFile}
          onCancel={() => setDeleteConfirm(null)}
        />
      ) : null}
    </div>
  );
}

function BrowseTab({
  files,
  loading,
  isAdmin,
  showDeleted,
  deletingId,
  restoringId,
  openFileIds,
  canOpenMore,
  filteringByUser,
  filteredUsername,
  pagination,
  onPrevPage,
  onNextPage,
  onNewFile,
  onEditFile,
  onDeleteFile,
  onRestoreFile,
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
        Loading files…
      </div>
    );
  }

  if (files.length === 0) {
    if (showDeleted) {
      return (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-lg font-medium text-zinc-800 dark:text-zinc-200">No deleted files</p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Deleted files will appear here for admin recovery.
          </p>
        </div>
      );
    }

    if (filteringByUser) {
      return (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-lg font-medium text-zinc-800 dark:text-zinc-200">No files</p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {filteredUsername ? (
              <>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{filteredUsername}</span> has not
                created any files yet.
              </>
            ) : (
              "This user has not created any files yet."
            )}
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-12 text-center dark:border-indigo-900/50 dark:bg-indigo-950/20">
        <p className="text-lg font-medium text-zinc-800 dark:text-zinc-200">No files yet</p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Create your first document with the rich text editor.
        </p>
        <button
          type="button"
          onClick={onNewFile}
          disabled={!canOpenMore}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-lg leading-none">+</span>
          New file
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Showing {files.length} of {pagination.total} {showDeleted ? "deleted " : ""}files
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevPage}
            disabled={!pagination.hasPrev || loading}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Prev
          </button>
          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Page {pagination.page} / {pagination.totalPages}
          </span>
          <button
            type="button"
            onClick={onNextPage}
            disabled={!pagination.hasNext || loading}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Next
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {files.map((file) => {
          const isOpen = openFileIds.has(file.id);
          return (
            <article
              key={file.id}
              className={`group flex flex-col rounded-xl border bg-white p-3 shadow-sm transition-[border-color,box-shadow] dark:bg-zinc-950 ${
                showDeleted
                  ? "border-red-200 bg-red-50/30 dark:border-red-900/40 dark:bg-red-950/10"
                  : isOpen
                    ? "border-indigo-400 ring-1 ring-indigo-400/30 dark:border-indigo-600"
                    : "border-zinc-200 hover:border-indigo-300 hover:shadow-md dark:border-zinc-700 dark:hover:border-indigo-700"
              }`}
            >
              <button
                type="button"
                onClick={() => onEditFile(file)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold text-zinc-900 group-hover:text-indigo-700 dark:text-zinc-100 dark:group-hover:text-indigo-300">
                    {file.name}
                  </h3>
                  {showDeleted ? (
                    <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-800 dark:bg-red-950/60 dark:text-red-200">
                      Deleted
                    </span>
                  ) : isOpen ? (
                    <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200">
                      Open
                    </span>
                  ) : null}
                </div>
                {isAdmin && !filteringByUser && file.owner?.username ? (
                  <p className="mt-0.5 truncate text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
                    {file.owner.username}
                  </p>
                ) : null}
                <p className="mt-1 line-clamp-2 text-xs leading-snug text-zinc-600 dark:text-zinc-400">
                  {isEmptyRichText(file.content) ? (
                    <span className="italic text-zinc-400 dark:text-zinc-500">Empty document</span>
                  ) : (
                    richTextPreview(file.content, 80)
                  )}
                </p>
              </button>

              <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                <div className="min-w-0 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
                  <p className="truncate">Created {formatShortDate(file.createdAt)}</p>
                  <p className="truncate">Updated {formatDate(file.updatedAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {showDeleted ? (
                    <>
                      <IconTooltipButton
                        title="Open in tab"
                        variant="accent"
                        onClick={() => onEditFile(file)}
                      >
                        <EditIcon />
                      </IconTooltipButton>
                      <button
                        type="button"
                        title="Restore file"
                        disabled={restoringId === file.id}
                        onClick={() => onRestoreFile(file)}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60"
                      >
                        {restoringId === file.id ? "Restoring…" : "Recover"}
                      </button>
                    </>
                  ) : (
                    <>
                      <IconTooltipButton
                        title={isOpen ? "Switch to tab" : "Open in tab"}
                        variant="accent"
                        onClick={() => onEditFile(file)}
                      >
                        <EditIcon />
                      </IconTooltipButton>
                      <IconTooltipButton
                        title="Delete file"
                        variant="danger"
                        disabled={deletingId === file.id}
                        onClick={() => onDeleteFile(file)}
                      >
                        <DeleteIcon />
                      </IconTooltipButton>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function DeleteConfirmDialog({ fileName, deleting, onConfirm, onCancel }) {
  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-zinc-950/50 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onCancel}
      />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-file-title"
          className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
        >
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
            <h3 id="delete-file-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Delete file?
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Delete <span className="font-medium text-zinc-800 dark:text-zinc-200">{fileName}</span>? It will be hidden
              from users. Admins can recover it later.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function UnsavedChangesDialog({ fileName, saving, saveError, onSave, onDiscard, onCancel }) {
  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-zinc-950/50 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onCancel}
      />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-changes-title"
          className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
        >
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
            <h3 id="unsaved-changes-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Save changes?
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{fileName}</span> has unsaved changes.
              Do you want to save before closing?
            </p>
            {saveError ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{saveError}</p> : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/30"
            >
              Don&apos;t save
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function WriteTabActions({
  isNewFile,
  isDeleted,
  saving,
  deleting,
  restoring,
  isDirty,
  onSave,
  onDelete,
  onRestore,
  onClose,
  allowDelete = true,
  allowClose = true,
  allowSave = true,
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {isDeleted ? (
        <button
          type="button"
          onClick={onRestore}
          disabled={restoring || saving}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60"
        >
          {restoring ? "Restoring…" : "Recover"}
        </button>
      ) : null}
      {!isNewFile && allowDelete ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting || saving}
          className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:border-red-900/50 dark:hover:bg-red-950/30"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      ) : null}
      {allowClose ? (
        <button
          type="button"
          onClick={onClose}
          disabled={saving || deleting || restoring}
          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Close
        </button>
      ) : null}
      {allowSave ? (
      <button
        type="button"
        onClick={onSave}
        disabled={saving || deleting || restoring}
        title="Save (Ctrl+S)"
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving…" : isDirty ? "Save" : "Saved"}
      </button>
      ) : null}
    </div>
  );
}

function WriteTab({
  tab,
  allowDelete = true,
  allowClose = true,
  allowSave = true,
  isDeleted = false,
  saving,
  deleting,
  restoring,
  onFileNameChange,
  onContentChange,
  onSave,
  onDelete,
  onRestore,
  onClose,
}) {
  const isNewFile = tab.fileId == null;
  const isDirty = isTabDirty(tab);

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving && !deleting && !restoring && allowSave) onSave();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onSave, saving, deleting, restoring, allowSave]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100/80 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50">
      <div className="shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
        <div className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
          <input
            id={`file-name-${tab.tabId}`}
            type="text"
            value={tab.fileName}
            onChange={(e) => onFileNameChange(e.target.value)}
            readOnly={isDeleted}
            placeholder="Untitled document"
            className={editorTitleClass}
          />
          <WriteTabActions
            isNewFile={isNewFile}
            isDeleted={isDeleted}
            allowDelete={allowDelete}
            allowClose={allowClose}
            allowSave={allowSave}
            saving={saving}
            deleting={deleting}
            restoring={restoring}
            isDirty={isDirty}
            onSave={onSave}
            onDelete={onDelete}
            onRestore={onRestore}
            onClose={onClose}
          />
        </div>

        {isDeleted ? (
          <p className="border-t border-red-200 bg-red-50 px-4 py-1.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 sm:px-5">
            This file is deleted. Open read-only — use Recover to restore it.
          </p>
        ) : null}

        {tab.saveError ? (
          <p className="border-t border-red-200 bg-red-50 px-4 py-1.5 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 sm:px-5">
            {tab.saveError}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <RichTextEditor
          key={tab.tabId}
          value={tab.content}
          onChange={onContentChange}
          editable={!isDeleted}
          placeholder="Start writing…"
          minHeightClass="min-h-[16rem]"
          wordLayout
          stickyToolbar
          embedded
        />
      </div>
    </div>
  );
}
