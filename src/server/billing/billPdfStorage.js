import fs from "node:fs/promises";
import {
  deleteStoredAttachment,
  isAttachmentStorageAvailable,
  readStoredAttachment,
} from "@/server/messages/attachmentStorage";

/** True when pdfPath looks like an attachment storage key (not a legacy filesystem path). */
export function isBillPdfStorageKey(pdfPath) {
  const key = String(pdfPath || "").trim();
  if (!key) return false;
  if (key.startsWith("bills/")) return true;
  // Absolute / relative filesystem paths used by older invoices.
  if (key.startsWith("/") || key.includes("storage/invoices") || key.includes("\\")) {
    return false;
  }
  return !key.includes(":");
}

export async function readBillPdfBytes(bill) {
  const pdfPath = String(bill?.pdfPath || "").trim();
  if (!pdfPath) {
    const err = new Error("PDF not generated yet");
    err.status = 404;
    throw err;
  }

  if (isBillPdfStorageKey(pdfPath)) {
    if (!isAttachmentStorageAvailable()) {
      const err = new Error("Attachment storage is not configured");
      err.status = 503;
      throw err;
    }
    return readStoredAttachment(pdfPath);
  }

  try {
    return await fs.readFile(pdfPath);
  } catch {
    const err = new Error("Failed to read PDF file");
    err.status = 500;
    throw err;
  }
}

/**
 * Delete PDF object (bucket or legacy file) and clear bill.pdfPath.
 */
export async function deleteBillPdf(bill) {
  const pdfPath = String(bill?.pdfPath || "").trim();
  if (!pdfPath) {
    return { deleted: false, missing: true };
  }

  if (isBillPdfStorageKey(pdfPath)) {
    await deleteStoredAttachment(pdfPath);
  } else {
    try {
      await fs.unlink(pdfPath);
    } catch (err) {
      const code = String(err?.code || "").toLowerCase();
      if (code !== "enoent") throw err;
    }
  }

  await bill.update({ pdfPath: null });
  return { deleted: true };
}
