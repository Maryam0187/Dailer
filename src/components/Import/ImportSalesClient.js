"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IMPORT_TARGET_GROUPS,
  buildDefaultColumnMap,
} from "@/lib/importSalesTargets";
import LegacyImportAssignControls from "@/components/Import/LegacyImportAssignControls";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-violet-500/80 focus:ring-2 focus:ring-violet-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-violet-400/70 dark:focus:ring-violet-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

const selectClass = `${inputClass} appearance-none`;

/** Client-side CSV parse (same rules as server). */
function parseCsvClient(text) {
  const input = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
  }
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h, idx) => {
    const name = String(h ?? "").trim();
    return name || `column_${idx + 1}`;
  });
  const dataRows = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r];
    const obj = {};
    for (let c = 0; c < headers.length; c += 1) {
      obj[headers[c]] = cells[c] != null ? String(cells[c]) : "";
    }
    dataRows.push(obj);
  }
  return { headers, rows: dataRows };
}

function detectAgentKeyTarget(columnMap) {
  const targets = Object.values(columnMap || {});
  if (targets.includes("agentId")) return "agentId";
  if (targets.includes("agentEmail")) return "agentEmail";
  if (targets.includes("agentName")) return "agentName";
  return null;
}

function findHeaderForTarget(columnMap, target) {
  return Object.entries(columnMap || {}).find(([, t]) => t === target)?.[0] ?? null;
}

function cellTrim(row, header) {
  if (!header) return "";
  return String(row[header] ?? "").trim();
}

/**
 * Distinct file agents for mapping, with name labels when those columns exist.
 * @returns {{ key: string, name: string, label: string }[]}
 */
function collectDistinctAgents(rows, columnMap, agentKeyTarget) {
  const keyHeader = findHeaderForTarget(columnMap, agentKeyTarget);
  if (!keyHeader) return [];

  const nameHeader = findHeaderForTarget(columnMap, "agentName");
  const headerList = Object.keys(columnMap || {});
  const guessNameHeader =
    nameHeader || headerList.find((h) => /^agentname$/i.test(h)) || null;
  const guessFirst = headerList.find((h) => /^agentfirstname$/i.test(h));
  const guessLast = headerList.find((h) => /^agentlastname$/i.test(h));

  const byKey = new Map();
  for (const row of rows) {
    const key = cellTrim(row, keyHeader);
    if (!key) continue;
    if (byKey.has(key)) continue;

    let name = guessNameHeader ? cellTrim(row, guessNameHeader) : "";
    if (!name && (guessFirst || guessLast)) {
      name = `${cellTrim(row, guessFirst)} ${cellTrim(row, guessLast)}`.trim();
    }

    const label = name && name !== key ? `${name} · ${agentKeyTarget === "agentId" ? `id ${key}` : key}` : name || key;

    byKey.set(key, {
      key,
      name,
      label,
    });
  }

  return Array.from(byKey.values()).sort((a, b) =>
    (a.name || a.label).localeCompare(b.name || b.label),
  );
}

export default function ImportSalesClient() {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [nightUsers, setNightUsers] = useState([]);
  const [agentMap, setAgentMap] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [importScope, setImportScope] = useState("pending");
  const [importedLeads, setImportedLeads] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [assignedCount, setAssignedCount] = useState(0);
  const [assignPick, setAssignPick] = useState({});
  const [assignBusyId, setAssignBusyId] = useState(null);
  const [lastBatch, setLastBatch] = useState(null);
  const [revertBusy, setRevertBusy] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState(null);

  const agentKeyTarget = useMemo(() => detectAgentKeyTarget(columnMap), [columnMap]);
  const fileAgents = useMemo(
    () => (agentKeyTarget ? collectDistinctAgents(rows, columnMap, agentKeyTarget) : []),
    [agentKeyTarget, rows, columnMap],
  );
  const agentKeys = useMemo(() => fileAgents.map((a) => a.key), [fileAgents]);

  const loadNightUsers = useCallback(async () => {
    const res = await fetch("/api/import/sales/night-users", { credentials: "include", cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to load night users");
    setNightUsers(json.users || []);
  }, []);

  const loadImported = useCallback(async (scope = importScope) => {
    const res = await fetch(`/api/import/sales/unassigned?scope=${scope}&limit=150`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to load imported sales");
    setImportedLeads(json.leads || []);
    setPendingCount(Number(json.pendingCount) || 0);
    setAssignedCount(Number(json.assignedCount) || 0);
  }, [importScope]);

  const loadLastBatch = useCallback(async () => {
    const res = await fetch("/api/import/sales/revert", { credentials: "include", cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to load last import");
    setLastBatch(json.batch || null);
  }, []);

  useEffect(() => {
    loadNightUsers().catch((e) => setError(e.message));
    loadLastBatch().catch(() => {});
  }, [loadNightUsers, loadLastBatch]);

  useEffect(() => {
    loadImported(importScope).catch(() => {});
  }, [importScope, loadImported]);

  async function onFileChange(e) {
    setError("");
    setResult(null);
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (!f) {
      setHeaders([]);
      setRows([]);
      setColumnMap({});
      return;
    }
    const text = await f.text();
    const parsed = parseCsvClient(text);
    if (!parsed.headers.length) {
      setError("Could not read CSV headers");
      return;
    }
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setColumnMap(buildDefaultColumnMap(parsed.headers));
    setAgentMap({});
    setStep(2);
  }

  function setTarget(header, target) {
    setColumnMap((prev) => ({ ...prev, [header]: target }));
  }

  function setAgentUser(key, userId) {
    setAgentMap((prev) => {
      const next = { ...prev };
      if (!userId) delete next[key];
      else next[key] = Number(userId);
      return next;
    });
  }

  async function runImport() {
    setError("");
    setResult(null);
    if (!file) {
      setError("Choose a CSV file first");
      return;
    }
    if (!Object.values(columnMap).includes("phone")) {
      setError("Map at least one column to Phone");
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("columnMap", JSON.stringify(columnMap));
      form.append("agentMap", JSON.stringify(agentMap));
      const res = await fetch("/api/import/sales", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Import failed");
      setResult(json);
      setStep(4);
      setImportScope("pending");
      await loadImported("pending");
      await loadLastBatch();
    } catch (e) {
      setError(e.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function assignLead(leadId) {
    const lead = importedLeads.find((l) => l.id === leadId);
    const agentUserId = Number(assignPick[leadId] || lead?.importOwnerUserId);
    if (!agentUserId) {
      setError("Pick a night-shift user for that lead");
      return;
    }
    setAssignBusyId(leadId);
    setError("");
    try {
      const res = await fetch("/api/import/sales/assign", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, agentUserId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Assign failed");
      await loadImported(importScope);
      await loadLastBatch();
    } catch (e) {
      setError(e.message || "Assign failed");
    } finally {
      setAssignBusyId(null);
    }
  }

  async function deleteLead(lead) {
    const ok = window.confirm(
      `Delete imported sale #${lead.id} (${lead.fullName || "—"})?\n\nCustomer is kept. This cannot be undone.`,
    );
    if (!ok) return;

    setDeleteBusyId(lead.id);
    setError("");
    try {
      const res = await fetch("/api/import/sales/delete", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Delete failed");
      await loadImported(importScope);
      await loadLastBatch();
    } catch (e) {
      setError(e.message || "Delete failed");
    } finally {
      setDeleteBusyId(null);
    }
  }

  async function revertLastImport() {
    if (!lastBatch) return;
    const ok = window.confirm(
      `Revert last import (batch #${lastBatch.id})?\n\n` +
        `This deletes ${lastBatch.remainingCount} lead(s)` +
        (lastBatch.fileName ? ` from “${lastBatch.fileName}”` : "") +
        `.\nCustomers are kept. This cannot be undone.`,
    );
    if (!ok) return;

    setRevertBusy(true);
    setError("");
    try {
      const res = await fetch("/api/import/sales/revert", {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Revert failed");
      setResult({
        created: 0,
        skipped: 0,
        errorCount: 0,
        errors: [],
        reverted: true,
        deletedCount: json.deletedCount,
        batchId: json.batchId,
      });
      await loadImported(importScope);
      await loadLastBatch();
    } catch (e) {
      setError(e.message || "Revert failed");
    } finally {
      setRevertBusy(false);
    }
  }

  const phoneMapped = Object.values(columnMap).includes("phone");

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50/90 to-white p-5 shadow-sm dark:border-violet-900/50 dark:from-violet-950/40 dark:to-zinc-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Imported sales</h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              Every imported sale stays here until you review it and click <strong>Send to Leads</strong> —
              even if you mapped agents during upload. Mapping only suggests who it belongs to; the main
              Leads list stays empty of these until you send each one.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lastBatch ? (
              <button
                type="button"
                disabled={revertBusy || lastBatch.remainingCount <= 0}
                onClick={revertLastImport}
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-950/70"
                title="Delete all leads from the last import batch"
              >
                {revertBusy
                  ? "Reverting…"
                  : `Revert last import (${lastBatch.remainingCount})`}
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-50 dark:border-violet-800 dark:bg-zinc-900 dark:text-violet-100 dark:hover:bg-zinc-800"
              onClick={() => {
                loadImported(importScope).catch((e) => setError(e.message));
                loadLastBatch().catch(() => {});
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        {lastBatch ? (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Last batch #{lastBatch.id}
            {lastBatch.fileName ? ` · ${lastBatch.fileName}` : ""} · created{" "}
            {lastBatch.createdCount} · remaining {lastBatch.remainingCount}
            {lastBatch.createdByUsername ? ` · by ${lastBatch.createdByUsername}` : ""}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { id: "pending", label: `Needs assign (${pendingCount})` },
            { id: "assigned", label: `Assigned (${assignedCount})` },
            { id: "all", label: "All imports" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setImportScope(tab.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                importScope === tab.id
                  ? "bg-violet-700 text-white dark:bg-violet-600"
                  : "bg-white text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {importedLeads.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            No imported sales in this tab yet. Upload a CSV below.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-violet-100 dark:divide-violet-900/40">
            {importedLeads.map((lead) => (
              <li
                key={lead.id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/leads/${lead.id}?from=import`}
                      className="font-semibold text-zinc-950 hover:underline dark:text-zinc-50"
                    >
                      #{lead.id} {lead.fullName}
                    </Link>
                    {lead.pending ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                        Pending assign
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
                        In Leads
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {lead.phone}
                    {lead.pending && lead.importOwnerUsername
                      ? ` · suggested: ${lead.importOwnerUsername}`
                      : ""}
                    {!lead.pending && lead.createdByUsername
                      ? ` · belongs to ${lead.createdByUsername}`
                      : ""}
                    {!lead.pending && lead.assignedUsername
                      ? ` · assigned ${lead.assignedUsername}`
                      : ""}
                  </p>
                  {lead.notesPreview ? (
                    <p className="mt-1 truncate text-xs text-zinc-400 dark:text-zinc-500">
                      {lead.notesPreview}
                    </p>
                  ) : null}
                </div>
                {lead.pending ? (
                  <div className="w-full max-w-md space-y-2 sm:w-auto">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/leads/${lead.id}?from=import`}
                        className="text-sm font-semibold text-violet-800 underline dark:text-violet-300"
                      >
                        Review sale
                      </Link>
                      <button
                        type="button"
                        disabled={deleteBusyId === lead.id}
                        onClick={() => deleteLead(lead)}
                        className="text-sm font-semibold text-red-700 underline disabled:opacity-50 dark:text-red-300"
                      >
                        {deleteBusyId === lead.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                    <LegacyImportAssignControls
                      nightUsers={nightUsers}
                      value={
                        assignPick[lead.id] ||
                        (lead.importOwnerUserId ? String(lead.importOwnerUserId) : "")
                      }
                      onChange={(v) => setAssignPick((prev) => ({ ...prev, [lead.id]: v }))}
                      onAssign={() => assignLead(lead.id)}
                      busy={assignBusyId === lead.id}
                      compact
                    />
                  </div>
                ) : (
                  <div className="text-right text-sm">
                    <p className="font-medium text-zinc-800 dark:text-zinc-200">
                      Belongs to {lead.createdByUsername || "—"}
                    </p>
                    <p className="text-zinc-500 dark:text-zinc-400">
                      Assigned {lead.assignedUsername || "—"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center justify-end gap-3">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-semibold text-violet-800 underline dark:text-violet-300"
                      >
                        Open in Leads
                      </Link>
                      <button
                        type="button"
                        disabled={deleteBusyId === lead.id}
                        onClick={() => deleteLead(lead)}
                        className="font-semibold text-red-700 underline disabled:opacity-50 dark:text-red-300"
                      >
                        {deleteBusyId === lead.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ol className="flex flex-wrap gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
        {[
          [1, "Upload"],
          [2, "Map columns"],
          [3, "Map users"],
          [4, "Result"],
        ].map(([n, label]) => (
          <li
            key={n}
            className={`rounded-full px-3 py-1 ${
              step === n
                ? "bg-violet-100 text-violet-950 dark:bg-violet-950/50 dark:text-violet-100"
                : "bg-zinc-100 dark:bg-zinc-800"
            }`}
          >
            {n}. {label}
          </li>
        ))}
      </ol>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">1. Upload CSV</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">CSV only (.csv). Excel: export as CSV first.</p>
        <div className="mt-4">
          <label className={labelClass} htmlFor="import-file">
            File
          </label>
          <input
            id="import-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            className={inputClass}
            onChange={onFileChange}
          />
          {file ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {file.name} · {rows.length} data row{rows.length === 1 ? "" : "s"} · {headers.length} columns
            </p>
          ) : null}
        </div>
      </section>

      {headers.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">2. Map columns</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                File header → database field. Use &quot;Append to notes&quot; for extra sale data. Phone is
                required. Map CSV <strong>status</strong> to{" "}
                <strong>Status → contact / phase / card / progress tags</strong>. Examples:{" "}
                <code className="text-xs">no_response</code>, <code className="text-xs">voicemail</code>{" "}
                → contact; <code className="text-xs">active</code>/<code className="text-xs">canceled</code>{" "}
                → phase; <code className="text-xs">charged</code>/<code className="text-xs">declined</code>/
                <code className="text-xs">chargeback</code> → card;{" "}
                <code className="text-xs">verified</code>/<code className="text-xs">processed</code> → tags.
              </p>
            </div>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => {
                if (!phoneMapped) {
                  setError("Map at least one column to Phone");
                  return;
                }
                setError("");
                setStep(3);
              }}
            >
              Continue to user mapping
            </button>
          </div>

          {!phoneMapped ? (
            <p className="mt-3 text-sm font-medium text-amber-800 dark:text-amber-200">
              Map a column to Phone before importing.
            </p>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-700">
                  <th className="px-2 py-2 font-semibold">File header</th>
                  <th className="px-2 py-2 font-semibold">Sample</th>
                  <th className="px-2 py-2 font-semibold">Map to</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((header) => (
                  <tr key={header} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="px-2 py-2 font-medium text-zinc-900 dark:text-zinc-100">{header}</td>
                    <td className="max-w-[12rem] truncate px-2 py-2 text-zinc-500 dark:text-zinc-400">
                      {String(rows[0]?.[header] ?? "").slice(0, 40)}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className={selectClass}
                        value={columnMap[header] || "skip"}
                        onChange={(e) => setTarget(header, e.target.value)}
                      >
                        {IMPORT_TARGET_GROUPS.map((group) => (
                          <optgroup key={group.id} label={group.label}>
                            {group.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {headers.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">3. Map users</h2>
          {agentKeyTarget ? (
            <>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Optional: map file agents to night-shift users as a <strong>suggestion</strong>. Sales
                still stay in Import until you review and <strong>Send to Leads</strong>. Unmapped
                agents are fine — pick the owner later per sale.
              </p>
              {nightUsers.length === 0 ? (
                <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
                  No night-shift users found. Set shift to Night on Users first.
                </p>
              ) : null}
              <div className="mt-4 space-y-3">
                {fileAgents.map((agent) => {
                  const mappedId = agentMap[agent.key];
                  const mappedUser = nightUsers.find((u) => String(u.id) === String(mappedId));
                  return (
                    <div key={agent.key} className="space-y-1">
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {agent.name || agent.label}
                          </div>
                          {agent.name && agent.key !== agent.name ? (
                            <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                              {agentKeyTarget === "agentId" ? `id ${agent.key}` : agent.key}
                            </div>
                          ) : null}
                        </div>
                        <select
                          className={selectClass}
                          value={agentMap[agent.key] || ""}
                          onChange={(e) => setAgentUser(agent.key, e.target.value)}
                        >
                          <option value="">— Skip (unmapped) —</option>
                          {nightUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.username}
                              {u.supervisorUsername ? ` → ${u.supervisorUsername}` : ""}
                              {` (#${u.id})`}
                            </option>
                          ))}
                        </select>
                      </div>
                      {mappedUser ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 sm:pl-[50%]">
                          Suggested owner <strong>{mappedUser.username}</strong>
                          {mappedUser.supervisorUsername
                            ? ` · supervisor ${mappedUser.supervisorUsername}`
                            : " · no supervisor"}
                          {" "}(still pending until Send to Leads)
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {fileAgents.length > 0 ? (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Mapped {Object.keys(agentMap).length} / {fileAgents.length}. Unmapped agents are skipped.
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              No agent column mapped. All rows import as pending — review each sale and send to Leads
              when ready (pick who it belongs to then).
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || !phoneMapped}
              onClick={runImport}
              className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-800 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
            >
              {busy ? "Importing…" : "Run import"}
            </button>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => setStep(2)}
            >
              Back to columns
            </button>
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <h2 className="text-lg font-semibold text-emerald-950 dark:text-emerald-50">4. Result</h2>
          {result.reverted ? (
            <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-100">
              Reverted batch #{result.batchId}: deleted <strong>{result.deletedCount}</strong> lead(s).
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-100">
                Created <strong>{result.created}</strong> lead(s), skipped{" "}
                <strong>{result.skipped}</strong>
                {result.batchId ? ` · batch #${result.batchId}` : ""}
                {result.errorCount ? ` (${result.errorCount} issues)` : ""}.
              </p>
              {result.errors?.length ? (
                <ul className="mt-3 max-h-48 overflow-y-auto text-sm text-emerald-950/80 dark:text-emerald-100/80">
                  {result.errors.map((err, idx) => (
                    <li key={`${err.row}-${idx}`}>
                      Row {err.row}: {err.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-3 text-sm text-emerald-900 dark:text-emerald-100">
                Sales are in <strong>Imported sales</strong> above — review each one, then{" "}
                <strong>Send to Leads</strong>. Nothing appears on the main Leads list until you do.
              </p>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
