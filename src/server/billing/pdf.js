import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  isAttachmentStorageAvailable,
  writeStoredAttachment,
} from "@/server/messages/attachmentStorage";
import { buildBillPdfStorageKey } from "@/server/messages/objectStorage";

/**
 * Build invoice PDF bytes: total cost + usage category breakdown only.
 */
export async function buildBillPdfBytes({ bill, usageCategories = [] }) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = { width: 595, height: 842 }; // A4
  let page = doc.addPage([pageSize.width, pageSize.height]);
  let y = pageSize.height - 40;

  const drawText = (text, x, size = 10, isBold = false) => {
    page.drawText(String(text ?? ""), {
      x,
      y,
      size,
      font: isBold ? bold : regular,
      color: rgb(0.1, 0.1, 0.1),
    });
  };

  const nextLine = (step = 14) => {
    y -= step;
    if (y < 60) {
      page = doc.addPage([pageSize.width, pageSize.height]);
      y = pageSize.height - 40;
    }
  };

  drawText("Dialer - Twilio Billing Invoice", 40, 18, true);
  nextLine(26);
  drawText(`Bill #${bill.id}`, 40, 12, true);
  nextLine(18);
  drawText(
    `Range: ${new Date(bill.fromDate).toLocaleDateString()} - ${new Date(bill.toDate).toLocaleDateString()}`,
    40,
  );
  nextLine();
  drawText(`Currency: ${bill.currency}`, 40);
  nextLine(22);

  drawText("Breakdown", 40, 12, true);
  nextLine(16);
  if (usageCategories.length) {
    for (const row of usageCategories) {
      drawText(
        `${row.label || row.category}: ${bill.currency} ${row.twilioCost}`,
        40,
      );
      nextLine();
    }
  } else {
    drawText("No category usage for this range.", 40);
    nextLine();
  }

  nextLine(10);
  drawText(`Total cost: ${bill.currency} ${bill.totalAmount}`, 40, 14, true);

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
