/* eslint-disable no-console */
/**
 * T4 smoke test for Twilio number sync / upsert.
 * Usage:
 *   DATABASE_URL='mysql://root:password@127.0.0.1:3307/dialer_db' npx jiti scripts/test-t4-twilio-numbers-sync.js
 */
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

const {
  upsertTwilioPhoneNumbers,
  syncTwilioPhoneNumbers,
} = require("../src/server/twilio/syncTwilioPhoneNumbers.js");
const db = require("../models");

async function main() {
  process.env.TWILIO_ACCOUNT_SID =
    process.env.TWILIO_ACCOUNT_SID || "ACmain0000000000000000000000000001";
  process.env.TWILIO_AUTH_TOKEN =
    process.env.TWILIO_AUTH_TOKEN || "main_auth_token_for_t4_test_only";
  process.env.NODE_ENV = "test";
  delete process.env.TWILIO_TEST_ACCOUNT_SID;
  delete process.env.TWILIO_TEST_AUTH_TOKEN;

  const [mgr] = await db.User.findOrCreate({
    where: { username: "__t4_sync_mgr__" },
    defaults: {
      role: "manager",
      passwordHash: null,
      isActive: true,
      isOutside: false,
      shiftKey: "day",
    },
  });
  const [agent] = await db.User.findOrCreate({
    where: { username: "__t4_sync_agent__" },
    defaults: {
      role: "agent",
      passwordHash: null,
      isActive: true,
      isOutside: false,
      shiftKey: "day",
      managerId: mgr.id,
    },
  });
  await agent.update({ managerId: mgr.id, twilioFromNumber: null, twilioFromNumberLine2: null });

  await db.TwilioPhoneNumber.destroy({
    where: { phoneNumber: ["+15557001001", "+15557001002", "+15557001003"] },
  });
  await db.ManagerTwilioAccount.destroy({ where: { managerId: mgr.id } });

  const first = await upsertTwilioPhoneNumbers(
    [
      { phoneNumber: "+15557001001", sid: "PN001", friendlyName: "Main One" },
      { phoneNumber: "+15557001002", sid: "PN002", friendlyName: "Main Two" },
    ],
    { accountKind: "main", managerId: null },
  );
  if (first.created !== 2) throw new Error(`expected 2 created, got ${first.created}`);
  console.log("upsert create main OK");

  await agent.update({ twilioFromNumber: "+15557001001" });

  const second = await upsertTwilioPhoneNumbers(
    [
      { phoneNumber: "+15557001001", sid: "PN001b", friendlyName: "Main One Updated" },
      { phoneNumber: "+15557001003", sid: "PN003", friendlyName: "Main Three" },
    ],
    { accountKind: "main", managerId: null },
  );
  if (second.updated < 1 || second.created < 1) {
    throw new Error(`expected update+create, got ${JSON.stringify(second)}`);
  }

  await agent.reload();
  if (agent.twilioFromNumber !== "+15557001001") {
    throw new Error("assignee twilioFromNumber must not be wiped by sync upsert");
  }
  const row = await db.TwilioPhoneNumber.findOne({ where: { phoneNumber: "+15557001001" } });
  if (row.friendlyName !== "Main One Updated" || row.twilioSid !== "PN001b") {
    throw new Error("upsert should refresh sid/friendlyName");
  }
  console.log("upsert update keeps assignees OK");

  const teamUpsert = await upsertTwilioPhoneNumbers(
    [{ phoneNumber: "+15557001002", sid: "PN002t", friendlyName: "Moved to team" }],
    { accountKind: "team", managerId: mgr.id },
  );
  if (teamUpsert.updated !== 1) throw new Error("expected team re-tag update");
  const moved = await db.TwilioPhoneNumber.findOne({ where: { phoneNumber: "+15557001002" } });
  if (moved.accountKind !== "team" || moved.managerId !== mgr.id) {
    throw new Error("number should be tagged to team");
  }
  console.log("upsert retag team OK");

  // sync team without ManagerTwilioAccount
  const noAcct = await syncTwilioPhoneNumbers({ scope: "team", managerId: mgr.id });
  if (noAcct.ok || !noAcct.error) {
    throw new Error("sync team without account should fail");
  }
  console.log("sync team missing account rejected OK");

  // sync team with bad credentials → structured failure, no throw
  await db.ManagerTwilioAccount.create({
    managerId: mgr.id,
    accountSid: "ACffffffffffffffffffffffffffffffff",
    authToken: "invalid_token_xxxxxxxxxxxxxx",
    apiKeySid: "SKffffffffffffffffffffffffffffffff",
    apiKeySecret: "invalid_secret_xxxxxxxxxxxxx",
  });
  const badTeam = await syncTwilioPhoneNumbers({ scope: "team", managerId: mgr.id });
  if (!badTeam.accounts?.[0] || badTeam.accounts[0].ok) {
    throw new Error("expected team sync failure with invalid creds");
  }
  console.log("sync team bad creds → ok:false OK:", badTeam.accounts[0].error?.slice(0, 60));

  // sync main with stub creds → fails network/auth but returns structured result
  const badMain = await syncTwilioPhoneNumbers({ scope: "main" });
  if (!badMain.accounts?.[0] || badMain.accounts[0].ok) {
    // If somehow succeeds (unlikely with stub), still fine
    console.log("sync main unexpected success (live creds?)");
  } else {
    console.log("sync main stub fails softly OK");
  }

  // sync all: main may fail, team fails — still returns accounts array (partial pattern)
  const all = await syncTwilioPhoneNumbers({ scope: "all" });
  if (!Array.isArray(all.accounts) || all.accounts.length < 2) {
    throw new Error("sync all should include main + team account results");
  }
  console.log("sync all returns per-account results OK, count:", all.accounts.length);

  // cleanup
  await db.TwilioPhoneNumber.destroy({
    where: { phoneNumber: ["+15557001001", "+15557001002", "+15557001003"] },
  });
  await db.ManagerTwilioAccount.destroy({ where: { managerId: mgr.id } });
  await agent.update({ twilioFromNumber: null });
  await agent.destroy();
  await mgr.destroy();
  await db.sequelize.close();
  console.log("T4 OK");
}

main().catch(async (err) => {
  console.error(err);
  try {
    await db.sequelize.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
