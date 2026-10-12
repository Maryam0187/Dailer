/* eslint-disable no-console */
/**
 * T5 smoke test for list / assign / unassign / manual add.
 * Usage:
 *   DATABASE_URL='mysql://root:password@127.0.0.1:3307/dialer_db' npx jiti ./scripts/test-t5-twilio-numbers-assign.js
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
  addTwilioPhoneNumberManual,
  assignTwilioPhoneNumber,
  deleteTwilioPhoneNumberFromInventory,
  listTwilioPhoneNumbersInventory,
  unassignTwilioPhoneNumber,
} = require("../src/server/twilio/twilioPhoneNumberAssign.js");
const db = require("../models");

const PHONES = {
  main1: "+15558001001",
  main2: "+15558001002",
  team1: "+15558002001",
  team2: "+15558002002",
};

async function cleanup(mgr, agentMain, agentTeam, otherMgr) {
  for (const p of Object.values(PHONES)) {
    await unassignTwilioPhoneNumber({ phoneNumber: p }).catch(() => {});
    await db.TwilioPhoneNumber.destroy({ where: { phoneNumber: p } });
  }
  if (mgr) await db.ManagerTwilioAccount.destroy({ where: { managerId: mgr.id } });
  if (otherMgr) await db.ManagerTwilioAccount.destroy({ where: { managerId: otherMgr.id } });
  for (const u of [agentMain, agentTeam, mgr, otherMgr]) {
    if (u) await u.destroy().catch(() => {});
  }
}

async function main() {
  process.env.TWILIO_ACCOUNT_SID =
    process.env.TWILIO_ACCOUNT_SID || "ACmain0000000000000000000000000001";
  process.env.TWILIO_AUTH_TOKEN =
    process.env.TWILIO_AUTH_TOKEN || "main_auth_token_for_t5_test_only";
  process.env.NODE_ENV = "test";
  delete process.env.TWILIO_TEST_ACCOUNT_SID;
  delete process.env.TWILIO_TEST_AUTH_TOKEN;

  const [mgr] = await db.User.findOrCreate({
    where: { username: "__t5_mgr__" },
    defaults: {
      role: "manager",
      passwordHash: null,
      isActive: true,
      isOutside: false,
      shiftKey: "day",
    },
  });
  const [otherMgr] = await db.User.findOrCreate({
    where: { username: "__t5_other_mgr__" },
    defaults: {
      role: "manager",
      passwordHash: null,
      isActive: true,
      isOutside: false,
      shiftKey: "day",
    },
  });
  const [agentMain] = await db.User.findOrCreate({
    where: { username: "__t5_agent_main__" },
    defaults: {
      role: "agent",
      passwordHash: null,
      isActive: true,
      isOutside: false,
      shiftKey: "day",
      managerId: null,
      canUseDialer2: true,
    },
  });
  await agentMain.update({
    managerId: null,
    canUseDialer2: true,
    twilioFromNumber: null,
    twilioFromNumberLine2: null,
  });

  const [agentTeam] = await db.User.findOrCreate({
    where: { username: "__t5_agent_team__" },
    defaults: {
      role: "agent",
      passwordHash: null,
      isActive: true,
      isOutside: false,
      shiftKey: "day",
      managerId: mgr.id,
      canUseDialer2: true,
    },
  });
  await agentTeam.update({
    managerId: mgr.id,
    canUseDialer2: true,
    twilioFromNumber: null,
    twilioFromNumberLine2: null,
  });

  await cleanup(null, null, null, null);
  await db.ManagerTwilioAccount.destroy({ where: { managerId: [mgr.id, otherMgr.id] } });
  for (const p of Object.values(PHONES)) {
    await db.TwilioPhoneNumber.destroy({ where: { phoneNumber: p } });
  }

  // Manual add main
  const addMain = await addTwilioPhoneNumberManual({
    phoneNumber: PHONES.main1,
    accountKind: "main",
  });
  if (!addMain.ok) throw new Error(addMain.error);
  console.log("manual add main OK");

  // Team add without ManagerTwilioAccount should fail
  const addTeamEarly = await addTwilioPhoneNumberManual({
    phoneNumber: PHONES.team1,
    accountKind: "team",
    managerId: mgr.id,
  });
  if (!addTeamEarly.error) throw new Error("team add without credentials should fail");
  console.log("team add without creds rejected OK");

  await db.ManagerTwilioAccount.create({
    managerId: mgr.id,
    accountSid: "ACt5aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    authToken: "tok",
    apiKeySid: "SKt5bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    apiKeySecret: "sec",
  });
  await db.ManagerTwilioAccount.create({
    managerId: otherMgr.id,
    accountSid: "ACt5cccccccccccccccccccccccccccccc",
    authToken: "tok",
    apiKeySid: "SKt5dddddddddddddddddddddddddddddd",
    apiKeySecret: "sec",
  });

  const addTeam = await addTwilioPhoneNumberManual({
    phoneNumber: PHONES.team1,
    accountKind: "team",
    managerId: mgr.id,
  });
  if (!addTeam.ok) throw new Error(addTeam.error);
  await addTwilioPhoneNumberManual({
    phoneNumber: PHONES.team2,
    accountKind: "team",
    managerId: otherMgr.id,
  });
  await addTwilioPhoneNumberManual({
    phoneNumber: PHONES.main2,
    accountKind: "main",
  });
  console.log("manual add team OK");

  // Assign main → main agent
  const a1 = await assignTwilioPhoneNumber({
    phoneNumber: PHONES.main1,
    userId: agentMain.id,
    line: 1,
  });
  if (!a1.ok) throw new Error(a1.error);
  await agentMain.reload();
  if (agentMain.twilioFromNumber !== PHONES.main1) throw new Error("main assign not saved");
  console.log("assign main→main agent OK");

  // Assign main → team agent should fail
  const badMainToTeam = await assignTwilioPhoneNumber({
    phoneNumber: PHONES.main2,
    userId: agentTeam.id,
    line: 1,
  });
  if (!badMainToTeam.error) throw new Error("main number to team agent should fail");
  console.log("reject main→team agent OK");

  // Assign team → team agent
  const a2 = await assignTwilioPhoneNumber({
    phoneNumber: PHONES.team1,
    userId: agentTeam.id,
    line: 1,
  });
  if (!a2.ok) throw new Error(a2.error);
  console.log("assign team→team agent OK");

  // Assign other team's number to agentTeam should fail
  const cross = await assignTwilioPhoneNumber({
    phoneNumber: PHONES.team2,
    userId: agentTeam.id,
    line: 2,
  });
  if (!cross.error) throw new Error("cross-team assign should fail");
  console.log("reject cross-team assign OK");

  // Conflict: same number to another user
  const conflict = await assignTwilioPhoneNumber({
    phoneNumber: PHONES.main1,
    userId: agentTeam.id,
    line: 1,
  });
  // Will fail for main→team first, but use a free main user scenario:
  // create second main agent by clearing manager and using agentMain's number on line2 of same user is conflict with different line
  const conflictLine = await assignTwilioPhoneNumber({
    phoneNumber: PHONES.main1,
    userId: agentMain.id,
    line: 2,
  });
  if (conflictLine.status !== 409) throw new Error("same number on another line should 409");
  console.log("conflict already-assigned OK");
  void conflict;

  // List includes assignees
  const list = await listTwilioPhoneNumbersInventory();
  const mainRow = list.find((n) => n.phoneNumber === PHONES.main1);
  if (!mainRow?.assignees?.some((a) => a.userId === agentMain.id && a.line === 1)) {
    throw new Error("list should show assignee");
  }
  console.log("list with assignees OK");

  // Unassign
  const u1 = await unassignTwilioPhoneNumber({ userId: agentMain.id, line: 1 });
  if (!u1.ok) throw new Error(u1.error);
  await agentMain.reload();
  if (agentMain.twilioFromNumber != null) throw new Error("unassign should clear");
  console.log("unassign by user+line OK");

  await assignTwilioPhoneNumber({
    phoneNumber: PHONES.main1,
    userId: agentMain.id,
    line: 1,
  });
  await unassignTwilioPhoneNumber({ phoneNumber: PHONES.main1 });
  await agentMain.reload();
  if (agentMain.twilioFromNumber != null) throw new Error("unassign by phone should clear");
  console.log("unassign by phone OK");

  // Delete while assigned should fail
  await assignTwilioPhoneNumber({
    phoneNumber: PHONES.main2,
    userId: agentMain.id,
    line: 1,
  });
  const delBlocked = await deleteTwilioPhoneNumberFromInventory({ phoneNumber: PHONES.main2 });
  if (delBlocked.status !== 409) throw new Error("delete assigned should 409");
  await unassignTwilioPhoneNumber({ phoneNumber: PHONES.main2 });
  const delOk = await deleteTwilioPhoneNumberFromInventory({ phoneNumber: PHONES.main2 });
  if (!delOk.ok) throw new Error(delOk.error);
  console.log("delete inventory OK");

  await cleanup(mgr, agentMain, agentTeam, otherMgr);
  await db.sequelize.close();
  console.log("T5 OK");
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
