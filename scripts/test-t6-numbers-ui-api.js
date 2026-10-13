const path = require("path");
const Module = require("module");
const projectRoot = path.join(__dirname, "..");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(projectRoot, "src", request.slice(2));
  return origResolve.call(this, request, parent, isMain, options);
};
const db = require("../models");
const { listTwilioPhoneNumbersInventory } = require("../src/server/twilio/twilioPhoneNumberAssign.js");

(async () => {
  const numbers = await listTwilioPhoneNumbersInventory();
  if (!Array.isArray(numbers)) throw new Error("numbers not array");
  const accounts = await db.ManagerTwilioAccount.findAll({ attributes: ["managerId"] });
  console.log("inventory rows:", numbers.length, "teams with subaccounts:", accounts.length);
  console.log("T6 API shape OK");
  await db.sequelize.close();
})().catch(async (e) => { console.error(e); process.exit(1); });
