import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function writeBillPdf({ bill, items }) {
  const invoicesDir = path.join(process.cwd(), "storage", "invoices");
  fs.mkdirSync(invoicesDir, { recursive: true });
  const fileName = `bill-${bill.id}.pdf`;
  const filePath = path.join(invoicesDir, fileName);
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
  drawText(`Bill ID: ${bill.id}`, 40);
  nextLine();
  drawText(
    `Range: ${new Date(bill.fromDate).toLocaleDateString()} - ${new Date(bill.toDate).toLocaleDateString()}`,
    40,
  );
  nextLine();
  drawText(`Currency: ${bill.currency}`, 40);
  nextLine();
  drawText(`Fixed markup per call: ${bill.currency} ${bill.fixedMarkupPerCall}`, 40);
  nextLine(22);

  drawText("Call SID", 40, 11, true);
  drawText("To", 220, 11, true);
  drawText("Twilio", 330, 11, true);
  drawText("Markup", 410, 11, true);
  drawText("Line Total", 490, 11, true);
  nextLine(16);

  for (const item of items) {
    drawText(String(item.twilioSid || "").slice(0, 22), 40);
    drawText(String(item.toNumber || "-").slice(0, 18), 220);
    drawText(`${bill.currency} ${item.twilioCost}`, 330);
    drawText(`${bill.currency} ${item.markupApplied}`, 410);
    drawText(`${bill.currency} ${item.lineAmount}`, 490);
    nextLine();
  }

  nextLine(12);
  drawText(`Total calls: ${bill.totalCalls}`, 40, 11, true);
  nextLine(16);
  drawText(`Twilio base total: ${bill.currency} ${bill.twilioBaseAmount}`, 40);
  nextLine();
  drawText(`Markup total: ${bill.currency} ${bill.markupAmount}`, 40);
  nextLine();
  drawText(`Final total: ${bill.currency} ${bill.totalAmount}`, 40, 13, true);
  nextLine(24);
  drawText(
    "Note: Some billed entries may not show To/From numbers.",
    40,
    9,
    true,
  );
  nextLine(12);
  drawText(
    "These are Twilio-generated billable call legs (for example, client or conference segments).",
    40,
    9,
  );
  nextLine(12);
  drawText(
    "Any line with non-zero Twilio cost is included in this invoice and traceable by Call SID.",
    40,
    9,
  );

  const bytes = await doc.save();
  fs.writeFileSync(filePath, bytes);

  return filePath;
}
