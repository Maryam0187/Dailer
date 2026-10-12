/* eslint-disable no-console */
const path = require("path");
const Module = require("module");
const projectRoot = path.join(__dirname, "..");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(projectRoot, "src", request.slice(2));
  return origResolve.call(this, request, parent, isMain, options);
};

const {
  parseTwilioMainSettingsBody,
  resolveMainTwilioCredentials,
  serializeTwilioMainSettings,
} = require("../src/server/twilio/mainSettings.js");
const { getTwilioClient } = require("../src/server/twilio.js");
const db = require("../models");

(async () => {
  process.env.NODE_ENV = "test";
  delete process.env.TWILIO_TEST_ACCOUNT_SID;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;

  await db.TwilioMainSetting.destroy({ where: {} });

  let threw = false;
  try {
    await getTwilioClient();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("expected missing creds to throw");
  console.log("missing creds throws OK");

  const parsed = parseTwilioMainSettingsBody({
    accountSid: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    authToken: "token_value_here",
    apiKeySid: "SKbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    apiKeySecret: "api_secret_here",
    phoneNumber: "5551112222",
    phoneNumber2: "+15553334444",
  });
  if (parsed.error) throw new Error(parsed.error);

  const row = await db.TwilioMainSetting.create({
    ...parsed.data,
    updatedBy: null,
  });
  const ser = serializeTwilioMainSettings(row);
  if (!ser.authTokenMasked?.startsWith("****")) throw new Error("mask failed");
  if (ser.phoneNumber !== "+15551112222") throw new Error("e164 failed");

  const creds = await resolveMainTwilioCredentials();
  if (creds.source !== "db" || creds.accountSid !== parsed.data.accountSid) {
    throw new Error("resolve should prefer db");
  }
  const client = await getTwilioClient();
  if (!client) throw new Error("client missing");
  console.log("db credentials resolve OK");

  await row.destroy();
  await db.sequelize.close();
  console.log("main settings OK");
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
