"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RichTextEditor from "@/components/Leads/RichTextEditor";
import IconTooltipButton, { CloseIcon, DeleteIcon, EditIcon } from "@/components/Leads/IconTooltipButton";
import { isEmptyRichText, normalizeRichHtml, richTextPreview } from "@/lib/richText";

const MAX_OPEN_TABS = 5;

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";

const selectClass =
  "h-11 min-w-[200px] rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

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

export default function FilesClient({ userRole = "agent" }) {
  const isAdmin = userRole === "admin";
  const [files, setFiles] = useState([]);
  const [viewAll, setViewAll] = useState(false);
  const [userFilter, setUserFilter] = useState("all");
  const [filterUsers, setFilterUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openTabs, setOpenTabs] = useState([]);
  const [activeView, setActiveView] = useState("browse");
  const [savingTabId, setSavingTabId] = useState(null);
  const [deletingTabId, setDeletingTabId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [closeConfirm, setCloseConfirm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const openTabsRef = useRef(openTabs);
  openTabsRef.current = openTabs;

  const activeEditorTab = openTabs.find((tab) => tab.tabId === activeView) ?? null;
  const canOpenMore = openTabs.length < MAX_OPEN_TABS;
  const isBrowseActive = activeView === "browse" || !activeEditorTab;
  const isFilteringByUser = isAdmin && userFilter !== "all";
  const filteredUsername = filterUsers.find((user) => String(user.id) === userFilter)?.username ?? null;
  const isFilteredUserEmpty = isFilteringByUser && !loading && files.length === 0;

  const loadFiles = useCallback(async () => {
    setError(null);
    try {
      const qs = isAdmin && userFilter !== "all" ? `?userId=${encodeURIComponent(userFilter)}` : "";
      const res = await fetch(`/api/files${qs}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load files");
      setFiles(json.files || []);
      setViewAll(Boolean(json.viewAll));
    } catch (err) {
      setError(err.message || "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, userFilter]);

  useEffect(() => {
    setLoading(true);
    loadFiles();
  }, [loadFiles]);

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
      saveError: null,
      savedSnapshot: snapshot,
    };
    setOpenTabs((tabs) => [...tabs, tab]);
    setActiveView(tab.tabId);
    setError(null);
  }

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

    const result = await saveTab(tabId, { switchToTab: false, closeAfterSave: true });
    if (result?.ok) {
      setCloseConfirm(null);
    }
  }

  async function saveTab(tabId, { switchToTab = true, closeAfterSave = false } = {}) {
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
      if (switchToTab) {
        setActiveView(newTabId);
      }
      await loadFiles();
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
      await loadFiles();
    } catch (err) {
      const message = err.message || "Failed to delete file";
      if (openTab) updateTab(openTab.tabId, { saveError: message });
      else setError(message);
    } finally {
      if (openTab) setDeletingTabId(null);
      else setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setActiveView("browse")} className={browseTabClass(isBrowseActive)}>
            {viewAll ? "All files" : "My files"}
            {!loading ? (
              <span className="ml-1.5 rounded-full bg-indigo-200/80 px-1.5 py-0.5 text-[11px] font-bold text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-100">
                {files.length}
              </span>
            ) : null}
          </button>

          {openTabs.map((tab) => {
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
          })}

        </div>

        {isBrowseActive && !isFilteredUserEmpty ? (
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

      {!canOpenMore ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {MAX_OPEN_TABS} tabs open — close one to open another file.
        </p>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {isAdmin && isBrowseActive ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Filter by user
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
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
        </div>
      ) : null}

      {isBrowseActive ? (
        <BrowseTab
          files={files}
          loading={loading}
          deletingId={deletingId}
          openFileIds={new Set(openTabs.map((tab) => tab.fileId).filter(Boolean))}
          canOpenMore={canOpenMore}
          filteringByUser={isFilteringByUser}
          filteredUsername={filteredUsername}
          onNewFile={openNewFile}
          onEditFile={openEditFile}
          onDeleteFile={requestDeleteFile}
        />
      ) : activeEditorTab ? (
        <WriteTab
          tab={activeEditorTab}
          saving={savingTabId === activeEditorTab.tabId}
          deleting={deletingTabId === activeEditorTab.tabId}
          onFileNameChange={(value) => updateTab(activeEditorTab.tabId, { fileName: value, saveError: null })}
          onContentChange={(value) => updateTab(activeEditorTab.tabId, { content: value, saveError: null })}
          onSave={() => saveTab(activeEditorTab.tabId, { switchToTab: false, closeAfterSave: true })}
          onDelete={() => requestDeleteFile({ id: activeEditorTab.fileId, name: activeEditorTab.fileName })}
          onClose={() => requestCloseTab(activeEditorTab.tabId)}
        />
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
  deletingId,
  openFileIds,
  canOpenMore,
  filteringByUser,
  filteredUsername,
  onNewFile,
  onEditFile,
  onDeleteFile,
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
        Loading files…
      </div>
    );
  }

  if (files.length === 0) {
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
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {files.map((file) => {
        const isOpen = openFileIds.has(file.id);
        return (
          <article
            key={file.id}
            className={`group flex flex-col rounded-xl border bg-white p-3 shadow-sm transition-[border-color,box-shadow] dark:bg-zinc-950 ${
              isOpen
                ? "border-indigo-400 ring-1 ring-indigo-400/30 dark:border-indigo-600"
                : "border-zinc-200 hover:border-indigo-300 hover:shadow-md dark:border-zinc-700 dark:hover:border-indigo-700"
            }`}
          >
            <button type="button" onClick={() => onEditFile(file)} className="min-w-0 flex-1 text-left">
              <div className="flex items-start justify-between gap-2">
                <h3 className="truncate text-sm font-semibold text-zinc-900 group-hover:text-indigo-700 dark:text-zinc-100 dark:group-hover:text-indigo-300">
                  {file.name}
                </h3>
                {isOpen ? (
                  <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200">
                    Open
                  </span>
                ) : null}
              </div>
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
              </div>
            </div>
          </article>
        );
      })}
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
              Delete <span className="font-medium text-zinc-800 dark:text-zinc-200">{fileName}</span>? This cannot be
              undone.
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

function WriteTab({ tab, saving, deleting, onFileNameChange, onContentChange, onSave, onDelete, onClose }) {
  const isNewFile = tab.fileId == null;

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 bg-zinc-50/80 px-5 py-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <label htmlFor={`file-name-${tab.tabId}`} className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          File name
        </label>
        <input
          id={`file-name-${tab.tabId}`}
          type="text"
          value={tab.fileName}
          onChange={(e) => onFileNameChange(e.target.value)}
          placeholder="e.g. Meeting notes, Script draft"
          className={inputClass}
        />
      </div>

      <div className="p-5">
        <span className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Content</span>
        <RichTextEditor
          key={tab.tabId}
          value={tab.content}
          onChange={onContentChange}
          placeholder="Start writing…"
          minHeightClass="min-h-[420px]"
          wordLayout
        />

        {tab.saveError ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{tab.saveError}</p> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-zinc-50/80 px-5 py-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <div>
          {!isNewFile ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting || saving}
              className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/30"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving || deleting}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Close tab
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || deleting}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
