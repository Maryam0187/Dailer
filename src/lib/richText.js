const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "LI", "UL", "OL", "TABLE"]);

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

/** True for near-black / near-white colors that should follow the UI theme instead of inline styles. */
export function isThemeDefaultTextColor(color) {
  if (!color || typeof color !== "string") return false;
  const raw = color.trim().toLowerCase();
  if (!raw || raw === "inherit" || raw === "currentcolor" || raw === "transparent") return true;
  if (raw === "black" || raw === "#000" || raw === "#000000") return true;
  if (raw === "white" || raw === "#fff" || raw === "#ffffff") return true;

  let r;
  let g;
  let b;
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      r = parseInt(h[0] + h[0], 16);
      g = parseInt(h[1] + h[1], 16);
      b = parseInt(h[2] + h[2], 16);
    } else {
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    }
  } else {
    const rgb = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!rgb) return false;
    r = Number(rgb[1]);
    g = Number(rgb[2]);
    b = Number(rgb[3]);
  }

  if (![r, g, b].every((n) => Number.isFinite(n))) return false;
  // Near-black (light-mode default) or near-white (dark-mode default)
  return (r <= 45 && g <= 45 && b <= 45) || (r >= 230 && g >= 230 && b >= 230);
}

function stripThemeDefaultColorFromStyle(styleValue) {
  if (!styleValue) return "";
  const next = String(styleValue)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const match = part.match(/^color\s*:\s*(.+)$/i);
      if (!match) return true;
      return !isThemeDefaultTextColor(match[1].trim());
    })
    .join("; ");
  return next ? `${next};` : "";
}

function stripThemeDefaultTextColors(root) {
  root.querySelectorAll("[style]").forEach((node) => {
    const cleaned = stripThemeDefaultColorFromStyle(node.getAttribute("style"));
    if (cleaned) node.setAttribute("style", cleaned);
    else node.removeAttribute("style");
  });
}

export function sanitizeRichHtml(html) {
  if (!html) return "";
  let safe = String(html);
  safe = safe.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  safe = safe.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  safe = safe.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  safe = safe.replace(/javascript:/gi, "");

  if (typeof document === "undefined") {
    // SSR fallback: drop obvious default black/white inline colors
    return safe.replace(
      /(?:^|;)\s*color\s*:\s*(?:#0{3,6}|#1[0-9a-f]{5}|#f{3,6}|black|white|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|rgb\(\s*23\s*,\s*23\s*,\s*23\s*\)|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))\s*;?/gi,
      "",
    );
  }

  const el = document.createElement("div");
  el.innerHTML = safe;
  stripThemeDefaultTextColors(el);
  return el.innerHTML;
}

export function normalizeRichHtml(html) {
  const trimmed = sanitizeRichHtml(html || "").trim();
  if (!trimmed || isEmptyRichText(trimmed)) return "";
  if (typeof document === "undefined") return trimmed;
  const el = document.createElement("div");
  el.innerHTML = trimmed;
  stripThemeDefaultTextColors(el);
  const hasBlock = Array.from(el.childNodes).some(
    (node) => node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName),
  );
  if (!hasBlock) {
    const wrapped = document.createElement("div");
    wrapped.innerHTML = el.innerHTML;
    return wrapped.innerHTML;
  }
  return el.innerHTML;
}
