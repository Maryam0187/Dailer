export function trimFileName(value) {
  const name = String(value || "").trim();
  if (!name) return null;
  return name.slice(0, 255);
}

export function sanitizeFileContent(value) {
  if (!value) return "";
  let safe = String(value);
  safe = safe.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  safe = safe.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  safe = safe.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  safe = safe.replace(/javascript:/gi, "");
  safe = safe.replace(/<div\b[^>]*data-uploading\b[^>]*>[\s\S]*?<\/div>/gi, "");
  safe = safe.replace(/<img\b[^>]*>/gi, (tag) => {
    const idMatch = tag.match(/data-attachment-id\s*=\s*["']?(\d+)/i);
    if (!idMatch) return "";
    const id = idMatch[1];
    const altMatch = tag.match(/\balt\s*=\s*("([^"]*)"|'([^']*)')/i);
    const alt = (altMatch?.[2] ?? altMatch?.[3] ?? "").replace(/[<>]/g, "");
    return `<img data-attachment-id="${id}" src="/api/files/attachments/${id}/file?disposition=inline" alt="${alt}" class="file-doc-image">`;
  });
  return safe.slice(0, 65535);
}
