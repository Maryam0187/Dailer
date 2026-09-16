const MAX_LINES_FOR_LCS = 800;
const MAX_LINE_CHARS = 500;
const MAX_HUNKS = 5;

/** Prefer real newlines; fall back to sentence-ish splits for single-block rich text. */
function toLines(htmlOrText) {
  let text = String(htmlOrText || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  let lines = text.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim());

  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  lines = lines.filter(Boolean);

  // Single long paragraph → soft-split on sentence ends so "line" still means something.
  if (lines.length <= 1) {
    const one = lines[0] || "";
    if (!one) return [];
    const parts = one.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
    if (parts && parts.length > 1) {
      return parts.map((p) => p.trim()).filter(Boolean);
    }
    return [one];
  }

  return lines;
}

function truncateLine(text) {
  const s = String(text || "").trim();
  if (s.length <= MAX_LINE_CHARS) return s;
  return `${s.slice(0, MAX_LINE_CHARS - 1)}…`;
}

function lineDiffOps(prevLines, nextLines) {
  const n = prevLines.length;
  const m = nextLines.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      dp[i][j] =
        prevLines[i - 1] === nextLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && prevLines[i - 1] === nextLines[j - 1]) {
      ops.push({ type: "eq", text: prevLines[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "ins", text: nextLines[j - 1] });
      j -= 1;
    } else {
      ops.push({ type: "del", text: prevLines[i - 1] });
      i -= 1;
    }
  }
  ops.reverse();
  return ops;
}

/**
 * For each change hunk, show:
 *   (line above)
 *   − old line / + new line
 *   (line below)
 */
function formatLineHunks(ops) {
  const changeIndexes = [];
  for (let i = 0; i < ops.length; i += 1) {
    if (ops[i].type !== "eq") changeIndexes.push(i);
  }
  if (changeIndexes.length === 0) return ["Updated"];

  const regions = [];
  let regionStart = changeIndexes[0];
  let regionEnd = changeIndexes[0];
  for (let k = 1; k < changeIndexes.length; k += 1) {
    const idx = changeIndexes[k];
    // Merge adjacent change ops into one edit block.
    if (idx === regionEnd + 1) {
      regionEnd = idx;
    } else {
      regions.push([regionStart, regionEnd]);
      regionStart = idx;
      regionEnd = idx;
    }
  }
  regions.push([regionStart, regionEnd]);

  const lines = [];
  for (const [start, end] of regions.slice(0, MAX_HUNKS)) {
    let above = null;
    for (let i = start - 1; i >= 0; i -= 1) {
      if (ops[i].type === "eq" && ops[i].text.trim()) {
        above = ops[i].text;
        break;
      }
    }
    let below = null;
    for (let i = end + 1; i < ops.length; i += 1) {
      if (ops[i].type === "eq" && ops[i].text.trim()) {
        below = ops[i].text;
        break;
      }
    }

    const removed = [];
    const added = [];
    for (let i = start; i <= end; i += 1) {
      if (ops[i].type === "del" && ops[i].text.trim()) removed.push(ops[i].text);
      if (ops[i].type === "ins" && ops[i].text.trim()) added.push(ops[i].text);
    }

    if (lines.length) lines.push("");
    if (above) lines.push(`  ${truncateLine(above)}`);
    for (const line of removed) lines.push(`− ${truncateLine(line)}`);
    for (const line of added) lines.push(`+ ${truncateLine(line)}`);
    if (below) lines.push(`  ${truncateLine(below)}`);
  }

  if (regions.length > MAX_HUNKS) {
    lines.push("");
    lines.push(`(+${regions.length - MAX_HUNKS} more change${regions.length - MAX_HUNKS === 1 ? "" : "s"})`);
  }

  return lines.length ? lines : ["Updated"];
}

/** Character-span fallback when there are too many lines. */
function formatSingleSpan(prev, nextText) {
  let start = 0;
  const minLen = Math.min(prev.length, nextText.length);
  while (start < minLen && prev[start] === nextText[start]) start += 1;

  let endPrev = prev.length;
  let endNext = nextText.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === nextText[endNext - 1]) {
    endPrev -= 1;
    endNext -= 1;
  }

  const removed = prev.slice(start, endPrev).trim();
  const added = nextText.slice(start, endNext).trim();
  const lines = [];
  if (removed) lines.push(`− ${truncateLine(removed)}`);
  if (added) lines.push(`+ ${truncateLine(added)}`);
  return lines.length ? lines.join("\n") : "Updated";
}

/**
 * Activity body for notes/breakdown: changed line(s) plus one line above and below.
 */
export function buildTextActivityDiff(previous, next, { clearedLabel }) {
  const prevLines = toLines(previous);
  const nextLines = toLines(next);

  if (nextLines.length === 0) return clearedLabel;
  if (prevLines.length === 0) {
    return nextLines.map((l) => `+ ${truncateLine(l)}`).join("\n");
  }

  if (prevLines.length > MAX_LINES_FOR_LCS || nextLines.length > MAX_LINES_FOR_LCS) {
    return formatSingleSpan(prevLines.join("\n"), nextLines.join("\n"));
  }

  const ops = lineDiffOps(prevLines, nextLines);
  return formatLineHunks(ops).join("\n");
}
