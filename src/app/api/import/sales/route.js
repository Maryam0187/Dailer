import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { runSalesImport } from "@/server/import/runSalesImport";
import { IMPORT_TARGET_VALUES } from "@/lib/importSalesTargets";
import { isSpreadsheetFileName, parseSpreadsheet, spreadsheetExtension } from "@/lib/parseSpreadsheet";

export const runtime = "nodejs";

function pickAgentKeyTarget(columnMap) {
  const targets = Object.values(columnMap || {});
  if (targets.includes("agentId")) return "agentId";
  if (targets.includes("agentEmail")) return "agentEmail";
  if (targets.includes("agentName")) return "agentName";
  return null;
}

export async function POST(req) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Spreadsheet file is required" }, { status: 400 });
  }

  const name = String(file.name || "").toLowerCase();
  if (name && !isSpreadsheetFileName(name)) {
    return NextResponse.json(
      { error: "Unsupported file type. Use CSV, TSV, Excel (.xlsx/.xls), or ODS." },
      { status: 400 },
    );
  }

  let columnMap;
  let agentMap;
  try {
    columnMap = JSON.parse(String(form.get("columnMap") || "{}"));
    agentMap = JSON.parse(String(form.get("agentMap") || "{}"));
  } catch {
    return NextResponse.json({ error: "Invalid columnMap or agentMap JSON" }, { status: 400 });
  }

  if (!columnMap || typeof columnMap !== "object") {
    return NextResponse.json({ error: "columnMap is required" }, { status: 400 });
  }

  for (const target of Object.values(columnMap)) {
    if (!IMPORT_TARGET_VALUES.has(target)) {
      return NextResponse.json({ error: `Invalid target: ${target}` }, { status: 400 });
    }
  }

  const ext = spreadsheetExtension(name);
  const isText = ext === ".csv" || ext === ".txt" || ext === ".tsv";
  let headers;
  let rows;
  try {
    if (isText) {
      ({ headers, rows } = parseSpreadsheet(await file.text(), name));
    } else {
      const buf = new Uint8Array(await file.arrayBuffer());
      ({ headers, rows } = parseSpreadsheet(buf, name));
    }
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Could not parse spreadsheet" },
      { status: 400 },
    );
  }

  if (headers.length === 0 || rows.length === 0) {
    return NextResponse.json({ error: "File has no data rows" }, { status: 400 });
  }

  for (const header of Object.keys(columnMap)) {
    if (!headers.includes(header)) {
      return NextResponse.json({ error: `Unknown header in map: ${header}` }, { status: 400 });
    }
  }

  const agentKeyTarget = pickAgentKeyTarget(columnMap);
  const result = await runSalesImport({
    rows,
    columnMap,
    agentMap: agentMap && typeof agentMap === "object" ? agentMap : {},
    adminUserId: authedUser.id,
    agentKeyTarget,
    fileName: String(file.name || "").slice(0, 255) || null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    batchId: result.batchId,
    created: result.created,
    skipped: result.skipped,
    errorCount: result.errorCount,
    errors: result.errors,
    agentKeyTarget,
  });
}
