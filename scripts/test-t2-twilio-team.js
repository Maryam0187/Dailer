/* eslint-disable no-console */
/**
 * T2 smoke test for team Twilio helpers.
 * Usage:
 *   DATABASE_URL='mysql://root:password@127.0.0.1:3307/dialer_db' npx jiti scripts/test-t2-twilio-team.js
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
  getTeamTwilioContext,
  resolveFromNumberLine1,
  resolveFromNumberLine2,
  resolveTeamManagerId,
  listIncomingNumbers,
} = require("../src/server/twilioTeam.js");
const { createVoiceAccessTokenForUser } = require("../src/server/twilioVoiceToken.js");
const db = require("../models");

async function main() {
  // Local .env.local may have empty Twilio placeholders; stub for client construction.
  if (!String(process.env.TWILIO_ACCOUNT_SID || "").trim()) {
    process.env.TWILIO_ACCOUNT_SID = "ACmain0000000000000000000000000001";
  }
  if (!String(process.env.TWILIO_AUTH_TOKEN || "").trim()) {
    process.env.TWILIO_AUTH_TOKEN = "main_auth_token_for_t2_test_only";
  }
  if (!String(process.env.TWILIO_API_KEY_SID || "").trim()) {
    process.env.TWILIO_API_KEY_SID = "SKmain0000000000000000000000000001";
  }
  if (!String(process.env.TWILIO_API_KEY_SECRET || "").trim()) {
    process.env.TWILIO_API_KEY_SECRET = "main_api_secret_for_t2_test_only";
  }
  if (!String(process.env.TWILIO_PHONE_NUMBER || "").trim()) {
    process.env.TWILIO_PHONE_NUMBER = "+15550000001";
  }
  if (!String(process.env.TWILIO_PHONE_NUMBER_2 || "").trim()) {
    process.env.TWILIO_PHONE_NUMBER_2 = "+15550000002";
  }
  // Avoid TWILIO_TEST_* override with empty strings in development.
  delete process.env.TWILIO_TEST_ACCOUNT_SID;
  delete process.env.TWILIO_TEST_AUTH_TOKEN;
  process.env.NODE_ENV = "test";

  const agentNoMgr = { id: 99, role: "agent", managerId: null };
  if (resolveTeamManagerId(agentNoMgr) !== null) {
    throw new Error("expected null manager id for agent without manager");
  }

  const ctxMain = await getTeamTwilioContext(agentNoMgr);
  if (ctxMain.mode !== "main") throw new Error(`expected main, got ${ctxMain.mode}`);
  console.log("main mode OK, sid prefix:", String(ctxMain.accountSid).slice(0, 4));

  const mainLine2 = await resolveFromNumberLine2(
    { ...agentNoMgr, twilioFromNumberLine2: null },
    ctxMain,
  );
  if (mainLine2 !== process.env.TWILIO_PHONE_NUMBER_2) {
    throw new Error("main Line2 should fall back to TWILIO_PHONE_NUMBER_2");
  }
  console.log("main Line2 fallback OK");

  const [mgr] = await db.User.findOrCreate({
    where: { username: "__t2_helper_mgr__" },
    defaults: {
      role: "manager",
      passwordHash: null,
      isActive: true,
      isOutside: false,
      shiftKey: "day",
    },
  });

  const incomplete = await db.ManagerTwilioAccount.create({
    managerId: mgr.id,
    accountSid: "ACincomplete000000000000000000000",
    authToken: "tok",
    apiKeySid: " ",
    apiKeySecret: " ",
  });
  const ctxIncomplete = await getTeamTwilioContext({
    id: mgr.id,
    role: "manager",
    managerId: null,
  });
  if (ctxIncomplete.mode !== "main") {
    throw new Error(`incomplete creds should be main, got ${ctxIncomplete.mode}`);
  }
  console.log("incomplete creds → main OK");
  await incomplete.destroy();

  const acct = await db.ManagerTwilioAccount.create({
    managerId: mgr.id,
    accountSid: "ACteam0000000000000000000000000001",
    authToken: "team_auth_token_xxxxxxxxxxxxxxxxx",
    apiKeySid: "SKteam0000000000000000000000000001",
    apiKeySecret: "team_api_secret_xxxxxxxxxxxxxxxx",
    defaultFromNumber: "+15550001111",
  });

  const ctxTeam = await getTeamTwilioContext({ id: mgr.id, role: "manager" });
  if (ctxTeam.mode !== "team" || ctxTeam.managerId !== mgr.id) {
    throw new Error("expected team mode for manager with complete account");
  }
  console.log("team mode OK, managerId:", ctxTeam.managerId);

  const agent = {
    id: 5,
    role: "agent",
    managerId: mgr.id,
    twilioFromNumber: null,
    twilioFromNumberLine2: null,
  };
  const ctxAgent = await getTeamTwilioContext(agent);
  if (ctxAgent.mode !== "team") throw new Error("agent under manager should be team");

  const from1 = await resolveFromNumberLine1(agent, ctxAgent);
  if (from1 !== "+15550001111") throw new Error(`expected team default From, got ${from1}`);
  console.log("Line1 team default OK");

  const assigned = { ...agent, twilioFromNumber: "+15550002222" };
  if ((await resolveFromNumberLine1(assigned, ctxAgent)) !== "+15550002222") {
    throw new Error("assigned Line1 not used");
  }
  console.log("Line1 assigned OK");

  let threw = false;
  try {
    await resolveFromNumberLine2(agent, ctxAgent);
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Line2 team without assignment should throw");
  console.log("Line2 team missing throws OK");

  const line2User = { ...agent, twilioFromNumberLine2: "+15550003333" };
  if ((await resolveFromNumberLine2(line2User, ctxAgent)) !== "+15550003333") {
    throw new Error("assigned Line2 not used");
  }
  console.log("Line2 assigned OK");

  const { token, identity } = await createVoiceAccessTokenForUser(mgr, "5-testuser");
  if (typeof token !== "string" || token.length < 20 || identity !== "5-testuser") {
    throw new Error("team voice token invalid");
  }
  console.log("team voice token OK");

  // Live list only when real Twilio creds are configured (non-stub).
  const liveSid = String(process.env.TWILIO_LIVE_ACCOUNT_SID || "").trim();
  const liveToken = String(process.env.TWILIO_LIVE_AUTH_TOKEN || "").trim();
  if (liveSid && liveToken) {
    const client = require("twilio")(liveSid, liveToken);
    const nums = await listIncomingNumbers(client);
    console.log("listIncomingNumbers count:", nums.length);
    if (!Array.isArray(nums)) throw new Error("listIncomingNumbers should return array");
  } else {
    // Shape check without network: empty list path still requires a client with the method.
    const fakeClient = {
      incomingPhoneNumbers: {
        list: async () => [{ phoneNumber: "+15550100", sid: "PN1", friendlyName: "x" }],
      },
    };
    const nums = await listIncomingNumbers(fakeClient);
    if (nums.length !== 1 || nums[0].sid !== "PN1") {
      throw new Error("listIncomingNumbers mapping failed");
    }
    console.log("listIncomingNumbers mapping OK (mocked; set TWILIO_LIVE_* for live fetch)");
  }

  await acct.destroy();
  await mgr.destroy();
  await db.sequelize.close();
  console.log("T2 OK");
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
