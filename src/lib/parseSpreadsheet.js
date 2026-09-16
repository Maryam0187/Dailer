import * as XLSX from "xlsx";
import { parseCsv } from "@/lib/parseCsv";

/** Spreadsheet extensions accepted for sales import. */
export const SPREADSHEET_EXTENSIONS = [
  ".csv",
  ".txt",
  ".tsv",
  ".xlsx",
  ".xls",
  ".xlsm",
  ".xlsb",
  ".ods",
];

const TEXT_EXTENSIONS = new Set([".csv", ".txt", ".tsv"]);

export const SPREADSHEET_ACCEPT =
  ".csv,.txt,.tsv,.xlsx,.xls,.xlsm,.xlsb,.ods,text/csv,text/plain,text/tab-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet";

export function spreadsheetExtension(fileName) {
  const name = String(fileName || "").toLowerCase().trim();
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot);
}

export function isSpreadsheetFileName(fileName) {
  return SPREADSHEET_EXTENSIONS.includes(spreadsheetExtension(fileName));
}

/**
 * Convert a matrix (first row = headers) into { headers, rows }.
 * @param {unknown[][]} matrix
 */
export function matrixToRecords(matrix) {
  const rows = Array.isArray(matrix) ? matrix : [];
  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = (rows[0] || []).map((h, idx) => {
    const name = String(h ?? "").trim();
    return name || `column_${idx + 1}`;
  });

  const dataRows = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r] || [];
    if (!cells.some((cell) => String(cell ?? "").trim() !== "")) continue;
    const obj = {};
    for (let c = 0; c < headers.length; c += 1) {
      const val = cells[c];
      obj[headers[c]] = val == null ? "" : String(val);
    }
    dataRows.push(obj);
  }

  return { headers, rows: dataRows };
}

function parseWorkbook(workbook) {
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  return matrixToRecords(matrix);
}

/**
 * Parse CSV/TSV/TXT text, or Excel/ODS ArrayBuffer / Uint8Array.
 * @param {string | ArrayBuffer | Uint8Array} data
 * @param {string} fileName
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseSpreadsheet(data, fileName = "") {
  const ext = spreadsheetExtension(fileName);

  if (typeof data === "string" || TEXT_EXTENSIONS.has(ext)) {
    const text =
      typeof data === "string"
        ? data
        : new TextDecoder("utf-8").decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data);

    if (ext === ".tsv") {
      const workbook = XLSX.read(text.replace(/^\uFEFF/, ""), {
        type: "string",
        FS: "\t",
        raw: false,
      });
      return parseWorkbook(workbook);
    }

    return parseCsv(text);
  }

  const workbook = XLSX.read(data, { type: "array", cellDates: true, raw: false });
  return parseWorkbook(workbook);
}
