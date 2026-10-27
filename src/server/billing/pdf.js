import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  isAttachmentStorageAvailable,
  writeStoredAttachment,
} from "@/server/messages/attachmentStorage";
import { buildBillPdfStorageKey } from "@/server/messages/objectStorage";

const PAGE = { width: 595, height: 842 };
const MARGIN = 48;

const NAVY = rgb(0.067, 0.102, 0.165);
const RED = rgb(0.949, 0.184, 0.275);
const INK = rgb(0.09, 0.11, 0.15);
const MUTED = rgb(0.42, 0.46, 0.52);
const LINE = rgb(0.886, 0.898, 0.918);
const CARD = rgb(0.965, 0.969, 0.976);
const ROW = rgb(0.976, 0.98, 0.986);
const WHITE = rgb(1, 1, 1);
const HEADER_SUB = rgb(0.78, 0.82, 0.88);
const TOTAL_BG = rgb(0.992, 0.953, 0.957);

function formatAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "0.00");
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fitText(text, font, size, maxWidth) {
  const raw = String(text ?? "");
  if (font.widthOfTextAtSize(raw, size) <= maxWidth) return raw;
  let trimmed = raw;
  while (trimmed.length > 1 && font.widthOfTextAtSize(`${trimmed}...`, size) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}...`;
}

function drawRightText(page, text, rightX, y, size, font, color) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - width, y, size, font, color });
}

/**
 * Build invoice PDF bytes: total cost + usage category breakdown only.
 */
export async function buildBillPdfBytes({ bill, usageCategories = [] }) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Dialer Invoice #${bill.id ?? ""}`);
  doc.setAuthor("Dialer");
  doc.setSubject("Twilio billing invoice");
  doc.setCreator("Dialer");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pages = [];
  const contentBottom = 72;
  const tableX = MARGIN;
  const tableW = PAGE.width - MARGIN * 2;
  const rowH = 32;
  const headerH = 30;

  const addPage = () => {
    const page = doc.addPage([PAGE.width, PAGE.height]);
    pages.push(page);
    return page;
  };

  let page = addPage();

  const headerHpx = 148;
  page.drawRectangle({
    x: 0,
    y: PAGE.height - headerHpx,
    width: PAGE.width,
    height: headerHpx,
    color: NAVY,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE.height - headerHpx - 6,
    width: PAGE.width,
    height: 6,
    color: RED,
  });

  page.drawText("Dialer Invoice", {
    x: MARGIN,
    y: PAGE.height - 72,
    size: 28,
    font: bold,
    color: WHITE,
  });
  page.drawText("Twilio billing statement", {
    x: MARGIN,
    y: PAGE.height - 96,
    size: 11,
    font: regular,
    color: HEADER_SUB,
  });

  const billNo = `Bill #${bill.id}`;
  drawRightText(page, "BILL", PAGE.width - MARGIN, PAGE.height - 58, 9, bold, RED);
  drawRightText(page, billNo, PAGE.width - MARGIN, PAGE.height - 82, 18, bold, WHITE);

  let y = PAGE.height - headerHpx - 28;
  const cardH = 68;
  const gap = 14;
  const cardW = (tableW - gap) / 2;
  const cardY = y - cardH;

  const drawInfoCard = (x, label, value) => {
    page.drawRectangle({
      x,
      y: cardY,
      width: cardW,
      height: cardH,
      color: CARD,
      borderColor: LINE,
      borderWidth: 1,
    });
    page.drawRectangle({
      x,
      y: cardY,
      width: 4,
      height: cardH,
      color: RED,
    });
    page.drawText(label, {
      x: x + 18,
      y: cardY + 42,
      size: 8,
      font: bold,
      color: MUTED,
    });
    const valueSize = 12;
    const fitted = fitText(value, bold, valueSize, cardW - 34);
    page.drawText(fitted, {
      x: x + 18,
      y: cardY + 18,
      size: valueSize,
      font: bold,
      color: INK,
    });
  };

  const range = `${formatDate(bill.fromDate)} - ${formatDate(bill.toDate)}`;
  drawInfoCard(MARGIN, "BILLING PERIOD", range);
  drawInfoCard(MARGIN + cardW + gap, "CURRENCY", String(bill.currency || "USD"));

  y = cardY - 36;
  page.drawText("Breakdown", {
    x: MARGIN,
    y,
    size: 14,
    font: bold,
    color: INK,
  });
  y -= 18;

  const drawTableHeader = () => {
    page.drawRectangle({
      x: tableX,
      y: y - headerH,
      width: tableW,
      height: headerH,
      color: NAVY,
    });
    page.drawText("Category", {
      x: tableX + 16,
      y: y - 19,
      size: 9,
      font: bold,
      color: WHITE,
    });
    drawRightText(page, "Amount", tableX + tableW - 16, y - 19, 9, bold, WHITE);
    y -= headerH;
  };

  const drawContinuationHeader = () => {
    page.drawRectangle({
      x: 0,
      y: PAGE.height - 36,
      width: PAGE.width,
      height: 36,
      color: NAVY,
    });
    page.drawRectangle({
      x: 0,
      y: PAGE.height - 40,
      width: PAGE.width,
      height: 4,
      color: RED,
    });
    page.drawText("Dialer Invoice", {
      x: MARGIN,
      y: PAGE.height - 24,
      size: 11,
      font: bold,
      color: WHITE,
    });
    drawRightText(page, billNo, PAGE.width - MARGIN, PAGE.height - 24, 10, regular, WHITE);
    y = PAGE.height - 64;
  };

  drawTableHeader();

  const rows = usageCategories.length
    ? usageCategories
    : [{ label: "No category usage for this range.", twilioCost: null, empty: true }];

  rows.forEach((row, index) => {
    if (y - rowH < contentBottom) {
      page = addPage();
      drawContinuationHeader();
      drawTableHeader();
    }
    const top = y;
    page.drawRectangle({
      x: tableX,
      y: top - rowH,
      width: tableW,
      height: rowH,
      color: index % 2 === 0 ? WHITE : ROW,
    });
    page.drawLine({
      start: { x: tableX, y: top - rowH },
      end: { x: tableX + tableW, y: top - rowH },
      thickness: 0.6,
      color: LINE,
    });
    const label = fitText(row.label || row.category || "", regular, 11, tableW - 160);
    page.drawText(label, {
      x: tableX + 16,
      y: top - 20,
      size: 11,
      font: regular,
      color: INK,
    });
    if (!row.empty && row.twilioCost != null && row.twilioCost !== "") {
      const amount = `${bill.currency} ${formatAmount(row.twilioCost)}`;
      drawRightText(page, amount, tableX + tableW - 16, top - 20, 11, regular, INK);
    }
    y = top - rowH;
  });

  const totalH = 56;
  if (y - 16 - totalH < contentBottom) {
    page = addPage();
    drawContinuationHeader();
  }
  y -= 16;
  page.drawRectangle({
    x: tableX,
    y: y - totalH,
    width: tableW,
    height: totalH,
    color: TOTAL_BG,
  });
  page.drawRectangle({
    x: tableX,
    y: y - totalH,
    width: 5,
    height: totalH,
    color: RED,
  });
  page.drawText("Total cost", {
    x: tableX + 20,
    y: y - 34,
    size: 13,
    font: bold,
    color: INK,
  });
  const total = `${bill.currency} ${formatAmount(bill.totalAmount)}`;
  drawRightText(page, total, tableX + tableW - 18, y - 35, 16, bold, RED);

  pages.forEach((p, index) => {
    p.drawLine({
      start: { x: MARGIN, y: 46 },
      end: { x: PAGE.width - MARGIN, y: 46 },
      thickness: 0.6,
      color: LINE,
    });
    p.drawRectangle({
      x: MARGIN,
      y: 26,
      width: 8,
      height: 8,
      color: RED,
    });
    p.drawText("Powered by Twilio", {
      x: MARGIN + 14,
      y: 27,
      size: 9,
      font: bold,
      color: MUTED,
    });
    const footerRight = pages.length > 1 ? `Dialer Invoice  |  ${index + 1}` : "Dialer Invoice";
    drawRightText(p, footerRight, PAGE.width - MARGIN, 27, 9, regular, MUTED);
  });

  return Buffer.from(await doc.save());
}

/**
 * Create PDF and store it in the same attachment bucket (S3 or local).
 * @returns {Promise<{ storageKey: string }>}
 */
export async function writeBillPdf({ bill, usageCategories = [] }) {
  if (!isAttachmentStorageAvailable()) {
    throw new Error(
      "Attachment storage is not configured. Set S3_* env vars (same as message/file attachments).",
    );
  }

  const bytes = await buildBillPdfBytes({ bill, usageCategories });
  const storageKey = buildBillPdfStorageKey(bill.id, `bill-${bill.id}.pdf`);
  await writeStoredAttachment(storageKey, bytes, "application/pdf");
  return { storageKey };
}
