function escapeCsvCell(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function triggerCsvDownload(filename, lines) {
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
    type: "text/csv;charset=utf-8;",
  });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Build CSV text and trigger a browser download. */
export function downloadCsv(filename, headers, rows) {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  triggerCsvDownload(filename, lines);
}

/**
 * Download a CSV with multiple titled sections (blank line between each).
 * @param {string} filename
 * @param {{ title?: string, headers: string[], rows: unknown[][] }[]} sections
 */
export function downloadCsvSections(filename, sections) {
  const lines = [];
  for (const section of sections) {
    if (!section?.headers?.length) continue;
    if (lines.length) lines.push("");
    if (section.title) lines.push(escapeCsvCell(section.title));
    lines.push(section.headers.map(escapeCsvCell).join(","));
    for (const row of section.rows || []) {
      lines.push(row.map(escapeCsvCell).join(","));
    }
  }
  triggerCsvDownload(filename, lines);
}
