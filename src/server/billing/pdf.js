import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

function writeLine(doc, text, x, y, options = {}) {
  doc.fontSize(options.size || 10).text(text, x, y, options);
}

export async function writeBillPdf({ bill, items }) {
  const invoicesDir = path.join(process.cwd(), "storage", "invoices");
  fs.mkdirSync(invoicesDir, { recursive: true });
  const fileName = `bill-${bill.id}.pdf`;
  const filePath = path.join(invoicesDir, fileName);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const out = fs.createWriteStream(filePath);
    doc.pipe(out);

    writeLine(doc, "Dialer - Twilio Billing Invoice", 50, 40, { size: 18 });
    writeLine(doc, `Bill ID: ${bill.id}`, 50, 72);
    writeLine(doc, `Range: ${new Date(bill.fromDate).toLocaleDateString()} - ${new Date(bill.toDate).toLocaleDateString()}`, 50, 88);
    writeLine(doc, `Currency: ${bill.currency}`, 50, 104);
    writeLine(doc, `Fixed markup per call: ${bill.currency} ${bill.fixedMarkupPerCall}`, 50, 120);

    let y = 150;
    writeLine(doc, "Call SID", 50, y, { size: 11 });
    writeLine(doc, "To", 200, y, { size: 11 });
    writeLine(doc, "Twilio", 320, y, { size: 11 });
    writeLine(doc, "Markup", 400, y, { size: 11 });
    writeLine(doc, "Line Total", 470, y, { size: 11 });
    y += 16;

    for (const item of items) {
      if (y > 740) {
        doc.addPage();
        y = 50;
      }
      writeLine(doc, item.twilioSid, 50, y, { width: 140, ellipsis: true });
      writeLine(doc, item.toNumber || "-", 200, y, { width: 110, ellipsis: true });
      writeLine(doc, `${bill.currency} ${item.twilioCost}`, 320, y);
      writeLine(doc, `${bill.currency} ${item.markupApplied}`, 400, y);
      writeLine(doc, `${bill.currency} ${item.lineAmount}`, 470, y);
      y += 14;
    }

    y += 20;
    writeLine(doc, `Total calls: ${bill.totalCalls}`, 50, y, { size: 11 });
    y += 16;
    writeLine(doc, `Twilio base total: ${bill.currency} ${bill.twilioBaseAmount}`, 50, y, { size: 11 });
    y += 16;
    writeLine(doc, `Markup total: ${bill.currency} ${bill.markupAmount}`, 50, y, { size: 11 });
    y += 16;
    writeLine(doc, `Final total: ${bill.currency} ${bill.totalAmount}`, 50, y, { size: 13 });

    doc.end();
    out.on("finish", resolve);
    out.on("error", reject);
  });

  return filePath;
}
