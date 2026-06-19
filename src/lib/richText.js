const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "LI", "UL", "OL"]);

export function stripHtml(html) {
  if (!html) return "";
  if (typeof document === "undefined") {
    return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent || el.innerText || "").replace(/\s+/g, " ").trim();
}

/** Plain text for textarea display; keeps line breaks from rich HTML. */
export function plainTextFromHtml(html) {
  if (!html) return "";
  const raw = String(html);
  if (!/[<>]/.test(raw)) return raw;
  let text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n");
  return text.replace(/[ \t]+\n/g, "\n").trimEnd();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convert plain textarea content to HTML for TipTap. */
export function plainTextToHtml(text) {
  if (!text) return "";
  const raw = String(text);
  if (/[<>]/.test(raw)) return sanitizeRichHtml(raw);

  return raw
    .split("\n")
    .map((line) => `<p>${line ? escapeHtml(line) : "<br>"}</p>`)
    .join("");
}

/** Normalize stored value for the rich editor (plain text or HTML). */
export function toRichEditorHtml(value) {
  if (!value) return "";
  const raw = String(value);
  if (/[<>]/.test(raw)) return normalizeRichHtml(raw);
  return plainTextToHtml(raw);
}

export function isEmptyRichText(html) {
  return stripHtml(html).length === 0;
}

export function richTextPreview(html, maxLen = 28) {
  const text = stripHtml(html);
  if (!text) return "—";
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

export function sanitizeRichHtml(html) {
  if (!html) return "";
  let safe = String(html);
  safe = safe.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  safe = safe.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  safe = safe.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  safe = safe.replace(/javascript:/gi, "");
  return safe;
}

export function normalizeRichHtml(html) {
  const trimmed = sanitizeRichHtml(html || "").trim();
  if (!trimmed || isEmptyRichText(trimmed)) return "";
  if (typeof document === "undefined") return trimmed;
  const el = document.createElement("div");
  el.innerHTML = trimmed;
  const hasBlock = Array.from(el.childNodes).some(
    (node) => node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName),
  );
  if (!hasBlock) {
    const wrapped = document.createElement("div");
    wrapped.innerHTML = trimmed;
    return wrapped.innerHTML;
  }
  return el.innerHTML;
}
