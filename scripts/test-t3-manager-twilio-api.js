/* eslint-disable no-console */
/**
 * T3 smoke test for manager Twilio account helpers + DB upsert (admin API logic).
 * Usage:
 *   DATABASE_URL='mysql://root:password@127.0.0.1:3307/dialer_db' npx jiti scripts/test-t3-manager-twilio-api.js
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
  parseManagerTwilioAccountBody,
  serializeManagerTwilioAccount,
} = require("../src/server/twilio/managerTwilioAccountApi.js");
const { getTeamTwilioContext } = require("../src/server/twilioTeam.js");
const db = require("../models");

async function main() {
  process.env.TWILIO_ACCOUNT_SID =
    process.env.TWILIO_ACCOUNT_SID || "ACmain0000000000000000000000000001";
  process.env.TWILIO_AUTH_TOKEN =
    process.env.TWILIO_AUTH_TOKEN || "main_auth_token_for_t3_test_only";
  process.env.NODE_ENV = "test";
  delete process.env.TWILIO_TEST_ACCOUNT_SID;
  delete process.env.TWILIO_TEST_AUTH_TOKEN;

  // Validation
  const bad = parseManagerTwilioAccountBody({});
  if (!bad.error) throw new Error("empty body should error");
  console.log("empty body rejected OK");

  const badSid = parseManagerTwilioAccountBody({
    accountSid: "bad",
    authToken: "tok",
    apiKeySid: "SKaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    apiKeySecret: "sec",
  });
  if (!badSid.error) throw new Error("bad accountSid should error");
  console.log("bad accountSid rejected OK");

  const ok = parseManagerTwilioAccountBody({
    accountSid: "ACbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    authToken: "secret_token_value",
    apiKeySid: "SKcccccccccccccccccccccccccccccccc",
    apiKeySecret: "api_secret_value",
    defaultFromNumber: "5551234567",
  });
  if (ok.error || ok.data.defaultFromNumber !== "+15551234567") {
    throw new Error(`parse failed: ${ok.error || ok.data.defaultFromNumber}`);
  }
  console.log("parse + E.164 OK");

  const [mgr] = await db.User.findOrCreate({
    where: { username: "__t3_mgr_twilio__" },
    defaults: {
      role: "manager",
      passwordHash: null,
      isActive: true,
      isOutside: false,
      shiftKey: "day",
    },
  });
  const [agent] = await db.User.findOrCreate({
    where: { username: "__t3_agent_twilio__" },
    defaults: {
      role: "agent",
      passwordHash: null,
      isActive: true,
      isOutside: false,
      shiftKey: "day",
      managerId: mgr.id,
    },
  });
  await agent.update({ managerId: mgr.id });

  // Non-manager must be rejected by API layer (simulate)
  if (agent.role === "manager") throw new Error("fixture agent should not be manager");
  console.log("non-manager role check fixture OK");

  await db.ManagerTwilioAccount.destroy({ where: { managerId: mgr.id } });

  let ctx = await getTeamTwilioContext({ id: mgr.id, role: "manager" });
  if (ctx.mode !== "main") throw new Error("before upsert should be main");
  console.log("before upsert → main OK");

  const created = await db.ManagerTwilioAccount.create({
    managerId: mgr.id,
    ...ok.data,
  });
  const serialized = serializeManagerTwilioAccount(created);
  if (serialized.authTokenMasked !== "****alue") {
    // last 4 of secret_token_value
  }
  if (!serialized.authTokenMasked?.startsWith("****")) {
    throw new Error("authToken should be masked");
  }
  if (serialized.authToken) throw new Error("full authToken must not be in serialize");
  if (!serialized.configured) throw new Error("configured should be true");
  console.log("serialize masks secrets OK");

  ctx = await getTeamTwilioContext({ id: mgr.id, role: "manager" });
  if (ctx.mode !== "team" || ctx.accountSid !== ok.data.accountSid) {
    throw new Error("after create should be team");
  }
  const agentCtx = await getTeamTwilioContext({
    id: agent.id,
    role: "agent",
    managerId: mgr.id,
  });
  if (agentCtx.mode !== "team") throw new Error("agent under manager should be team");
  console.log("after upsert → team for manager+agent OK");

  // Update: keep secrets when masked payload
  const updateParsed = parseManagerTwilioAccountBody(
    {
      accountSid: "ACdddddddddddddddddddddddddddddddd",
      apiKeySid: "SKeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      authToken: "****alue",
      apiKeySecret: "",
      defaultFromNumber: "",
    },
    created,
  );
  if (updateParsed.error) throw new Error(updateParsed.error);
  if (updateParsed.data.authToken !== ok.data.authToken) {
    throw new Error("masked authToken should keep existing");
  }
  if (updateParsed.data.apiKeySecret !== ok.data.apiKeySecret) {
    throw new Error("empty apiKeySecret should keep existing");
  }
  if (updateParsed.data.defaultFromNumber !== null) {
    throw new Error("empty defaultFromNumber should clear to null");
  }
  await created.update(updateParsed.data);
  await created.reload();
  if (created.accountSid !== "ACdddddddddddddddddddddddddddddddd") {
    throw new Error("accountSid should update");
  }
  console.log("update keeps secrets / clears default From OK");

  await created.destroy();
  ctx = await getTeamTwilioContext({ id: mgr.id, role: "manager" });
  if (ctx.mode !== "main") throw new Error("after delete should be main");
  console.log("delete → main OK");

  await agent.destroy();
  await mgr.destroy();
  await db.sequelize.close();
  console.log("T3 OK");
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
