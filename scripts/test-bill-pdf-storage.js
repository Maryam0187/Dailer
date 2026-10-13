/* eslint-disable no-console */
const path = require("path");
const Module = require("module");

const projectRoot = path.join(__dirname, "..");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    request = path.join(projectRoot, "src", request.slice(2));
  }
  return origResolve.call(this, request, parent, isMain, options);
};

const { isBillPdfStorageKey } = require("../src/server/billing/billPdfStorage.js");
const { buildBillPdfBytes } = require("../src/server/billing/pdf.js");
const { buildBillPdfStorageKey } = require("../src/server/messages/objectStorage.js");

async function main() {
  if (!isBillPdfStorageKey("bills/12/abc-bill-12.pdf")) {
    throw new Error("storage key detect fail");
  }
  if (isBillPdfStorageKey("/app/storage/invoices/bill-1.pdf")) {
    throw new Error("legacy path should not be key");
  }
  const key = buildBillPdfStorageKey(99, "bill-99.pdf");
  if (!key.startsWith("bills/99/")) throw new Error(`bad key ${key}`);

  const bytes = await buildBillPdfBytes({
    bill: {
      id: 1,
      fromDate: new Date("2026-01-01"),
      toDate: new Date("2026-01-07"),
      currency: "USD",
      totalAmount: "2.05",
    },
    usageCategories: [
      { category: "calls", label: "Programmable Voice", twilioCost: "0.40" },
      { category: "calls-client", label: "Client", twilioCost: "0.10" },
      { category: "recordings", label: "Recording", twilioCost: "0.05" },
      { category: "phonenumbers", label: "Phone Numbers", twilioCost: "1.00" },
    ],
  });
  if (!Buffer.isBuffer(bytes) || bytes.length < 100) throw new Error("pdf bytes too small");
  if (bytes.slice(0, 4).toString() !== "%PDF") throw new Error("not a pdf");
  console.log("bill pdf helpers OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
