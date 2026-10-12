/* eslint-disable no-console */
/**
 * Smoke tests for T8–T11: dial/token team context, call-owner mid-call helpers, team billing.
 * Usage:
 *   DATABASE_URL='mysql://root:password@127.0.0.1:3307/dialer_db' npx jiti scripts/test-t8-t11-team-dial-billing.js
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

const db = require("../models");
const {
  getTeamTwilioContext,
  resolveFromNumberLine1,
  resolveFromNumberLine2,
} = require("../src/server/twilioTeam.js");
const {
  getTwilioContextForUserId,
  resolveDialUser,
  loadUserForTwilio,
} = require("../src/server/twilio/callOwnerTwilio.js");
const {
  createVoiceAccessTokenForUser,
  getAgentClientIdentity,
  getAgentClientIdentityLine2,
} = require("../src/server/twilioVoiceToken.js");
const {
  resolveBillingTwilioClient,
  listBillingUsageForClient,
  BILLING_USAGE_CATEGORIES,
} = require("../src/server/billing/twilioUsage.js");
const { calculateUsageTotals } = require("../src/server/billing/math.js");

function stubMainEnv() {
  if (!String(process.env.TWILIO_ACCOUNT_SID || "").trim()) {
    process.env.TWILIO_ACCOUNT_SID = "ACmain0000000000000000000000000001";
  }
  if (!String(process.env.TWILIO_AUTH_TOKEN || "").trim()) {
    process.env.TWILIO_AUTH_TOKEN = "main_auth_token_for_t8_test_only";
  }
  if (!String(process.env.TWILIO_API_KEY_SID || "").trim()) {
    process.env.TWILIO_API_KEY_SID = "SKmain0000000000000000000000000001";
  }
  if (!String(process.env.TWILIO_API_KEY_SECRET || "").trim()) {
    process.env.TWILIO_API_KEY_SECRET = "main_api_secret_for_t8_test_only";
  }
  if (!String(process.env.TWILIO_PHONE_NUMBER || "").trim()) {
    process.env.TWILIO_PHONE_NUMBER = "+15550000001";
  }
  if (!String(process.env.TWILIO_PHONE_NUMBER_2 || "").trim()) {
    process.env.TWILIO_PHONE_NUMBER_2 = "+15550000002";
  }
  delete process.env.TWILIO_TEST_ACCOUNT_SID;
  delete process.env.TWILIO_TEST_AUTH_TOKEN;
}

async function cleanup(mgr, agent) {
  if (agent) {
    await agent.update({
      managerId: null,
      twilioFromNumber: null,
      twilioFromNumberLine2: null,
      canUseDialer2: false,
    });
  }
  if (mgr) {
    await db.ManagerTwilioAccount.destroy({ where: { managerId: mgr.id } });
    await db.TwilioPhoneNumber.destroy({
      where: { managerId: mgr.id },
    });
  }
}

async function main() {
  stubMainEnv();
  await db.sequelize.authenticate();

  const stamp = Date.now();
  let mgr = null;
  let agent = null;

  try {
    mgr = await db.User.create({
      username: `t8mgr_${stamp}`,
      passwordHash: null,
      role: "manager",
      isActive: true,
      isOutside: false,
      shiftKey: "day",
    });
    agent = await db.User.create({
      username: `t8agent_${stamp}`,
      passwordHash: null,
      role: "agent",
      isActive: true,
      isOutside: false,
      shiftKey: "day",
      managerId: mgr.id,
      canUseDialer2: true,
      twilioFromNumber: "+15551110001",
      twilioFromNumberLine2: "+15551110002",
    });

    await db.ManagerTwilioAccount.create({
      managerId: mgr.id,
      accountSid: "ACteam0000000000000000000000000001",
      authToken: "team_auth_token_for_t8_test_only",
      apiKeySid: "SKteam0000000000000000000000000001",
      apiKeySecret: "team_api_secret_for_t8_test_only",
      defaultFromNumber: "+15551110001",
    });

    // --- T8 / T9: dial From + Voice tokens use team account ---
    const dialUser = await resolveDialUser({ id: agent.id });
    if (!dialUser || dialUser.managerId !== mgr.id) {
      throw new Error("resolveDialUser failed");
    }

    const ctx = await getTeamTwilioContext(dialUser);
    if (ctx.mode !== "team" || ctx.managerId !== mgr.id) {
      throw new Error(`expected team context, got ${JSON.stringify({ mode: ctx.mode, managerId: ctx.managerId })}`);
    }
    if (String(ctx.accountSid) !== "ACteam0000000000000000000000000001") {
      throw new Error(`expected team accountSid, got ${ctx.accountSid}`);
    }

    const from1 = await resolveFromNumberLine1(dialUser, ctx);
    const from2 = await resolveFromNumberLine2(dialUser, ctx);
    if (from1 !== "+15551110001") throw new Error(`Line1 From expected +15551110001 got ${from1}`);
    if (from2 !== "+15551110002") throw new Error(`Line2 From expected +15551110002 got ${from2}`);
    console.log("T8/T9 dial From OK:", from1, from2);

    const id1 = getAgentClientIdentity(agent.id, agent.username);
    const id2 = getAgentClientIdentityLine2(agent.id, agent.username);
    const token1 = await createVoiceAccessTokenForUser(dialUser, id1);
    const token2 = await createVoiceAccessTokenForUser(dialUser, id2);
    if (!token1?.token || !token2?.token) throw new Error("Voice tokens missing");
    if (token1.identity !== id1 || token2.identity !== id2) {
      throw new Error("token identity mismatch");
    }
    // Team JWT is signed with team account SID in the iss/sub — decode middle segment.
    const payload1 = JSON.parse(
      Buffer.from(String(token1.token).split(".")[1], "base64url").toString("utf8"),
    );
    if (payload1.iss !== "SKteam0000000000000000000000000001") {
      throw new Error(`expected team API key iss, got ${payload1.iss}`);
    }
    if (payload1.sub !== "ACteam0000000000000000000000000001") {
      throw new Error(`expected team account sub, got ${payload1.sub}`);
    }
    console.log("T8/T9 Voice tokens OK (team account JWT)");

    // --- T10: call-owner context ---
    const owner = await getTwilioContextForUserId(agent.id);
    if (owner.ctx.mode !== "team" || owner.ctx.managerId !== mgr.id) {
      throw new Error("getTwilioContextForUserId should resolve team for agent");
    }
    const loaded = await loadUserForTwilio(agent.id);
    if (!loaded || loaded.twilioFromNumber !== "+15551110001") {
      throw new Error("loadUserForTwilio missing assigned From");
    }
    console.log("T10 call-owner Twilio context OK");

    // Manager without subaccount falls back to main when billing without managerId
    const mainBilling = await resolveBillingTwilioClient(null);
    if (mainBilling.managerId !== null) throw new Error("main billing should have null managerId");
    console.log("T11 main billing client OK");

    // Team billing resolves subaccount
    const teamBilling = await resolveBillingTwilioClient(mgr.id);
    if (teamBilling.managerId !== mgr.id) throw new Error("team billing managerId mismatch");
    if (teamBilling.managerUsername !== mgr.username) {
      throw new Error("team billing username mismatch");
    }
    console.log("T11 team billing client OK, manager:", teamBilling.managerUsername);

    // Invalid managerId
    let badOk = false;
    try {
      await resolveBillingTwilioClient(agent.id);
    } catch (err) {
      if (err.status === 400) badOk = true;
    }
    if (!badOk) throw new Error("expected 400 when managerId is not a manager");

    // Manager with no subaccount
    const orphan = await db.User.create({
      username: `t8orphan_${stamp}`,
      passwordHash: null,
      role: "manager",
      isActive: true,
      isOutside: false,
      shiftKey: "day",
    });
    let orphanOk = false;
    try {
      await resolveBillingTwilioClient(orphan.id);
    } catch (err) {
      if (err.status === 400 && /subaccount/i.test(err.message)) orphanOk = true;
    }
    await orphan.destroy();
    if (!orphanOk) throw new Error("expected error for manager without subaccount");

    // Usage categories: Client, Programmable Voice, Recording, Phone Numbers
    if (BILLING_USAGE_CATEGORIES.map((c) => c.key).join(",") !== "calls,calls-client,recordings,phonenumbers") {
      throw new Error("unexpected BILLING_USAGE_CATEGORIES keys");
    }
    const mockPrices = {
      calls: [{ price: "-0.40", count: "3", usage: "12", usageUnit: "minutes", priceUnit: "USD" }],
      "calls-client": [{ price: "-0.10", count: "2", usage: "5", usageUnit: "minutes", priceUnit: "USD" }],
      recordings: [{ price: "-0.05", count: "1", usage: "2", usageUnit: "minutes", priceUnit: "USD" }],
      phonenumbers: [{ price: "-1.00", count: "1", usage: "1", usageUnit: "numbers", priceUnit: "USD" }],
    };
    const mockClient = {
      usage: {
        records: {
          list: async ({ category }) => mockPrices[category] || [],
        },
      },
    };
    const usage = await listBillingUsageForClient(mockClient, {
      fromDate: new Date("2026-01-01T00:00:00Z"),
      toDate: new Date("2026-01-31T00:00:00Z"),
    });
    if (usage.length !== 4) throw new Error(`expected 4 categories, got ${usage.length}`);
    const totals = calculateUsageTotals(usage, 0.1);
    // call count = 3 voice + 2 client = 5; markup = 0.50
    if (totals.totalCalls !== 5) throw new Error(`totals.totalCalls expected 5 got ${totals.totalCalls}`);
    if (Number(totals.twilioBaseAmount) !== 1.55) {
      throw new Error(`twilioBaseAmount expected 1.55 got ${totals.twilioBaseAmount}`);
    }
    if (Number(totals.markupAmount) !== 0.5) {
      throw new Error(`markupAmount expected 0.50 got ${totals.markupAmount}`);
    }
    if (Number(totals.totalAmount) !== 2.05) {
      throw new Error(`totalAmount expected 2.05 got ${totals.totalAmount}`);
    }
    const labels = totals.categories.map((c) => c.label).join("|");
    if (!labels.includes("Programmable Voice") || !labels.includes("Client") || !labels.includes("Recording") || !labels.includes("Phone Numbers")) {
      throw new Error(`missing category labels: ${labels}`);
    }
    console.log("T11 usage categories + totals OK");

    // Persist a team-scoped Bill row (no PDF)
    const bill = await db.Bill.create({
      fromDate: new Date("2026-01-01"),
      toDate: new Date("2026-01-07"),
      currency: "USD",
      twilioBaseAmount: "0.75",
      fixedMarkupPerCall: "0.10",
      markupAmount: "0.20",
      totalCalls: 2,
      totalAmount: "0.95",
      status: "generated",
      generatedBy: mgr.id,
      managerId: mgr.id,
      pdfPath: null,
    });
    if (bill.managerId !== mgr.id) throw new Error("Bill.managerId not saved");
    await bill.destroy();
    console.log("T11 Bill.managerId column OK");

    console.log("\nAll T8–T11 smoke checks passed.");
  } finally {
    await cleanup(mgr, agent);
    if (agent) await agent.destroy().catch(() => {});
    if (mgr) await mgr.destroy().catch(() => {});
    await db.sequelize.close();
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
