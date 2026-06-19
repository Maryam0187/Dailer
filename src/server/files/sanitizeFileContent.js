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
  return safe.slice(0, 65535);
}
