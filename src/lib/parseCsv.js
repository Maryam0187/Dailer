/**
 * Minimal CSV parser: handles commas, quotes, and CRLF.
 * Returns { headers: string[], rows: Record<string, string>[] }.
 */
export function parseCsv(text) {
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

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

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
