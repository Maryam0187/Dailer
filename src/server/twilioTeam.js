import twilio from "twilio";
import db from "@/server/db";
import { getTwilioClient, getTwilioFromNumber, getTwilioLine2FromNumber } from "@/server/twilio";
import { resolveMainTwilioCredentials } from "@/server/twilio/mainSettings";

/**
 * @typedef {"main" | "team"} TwilioAccountMode
 *
 * @typedef {object} TeamTwilioContext
 * @property {TwilioAccountMode} mode
 * @property {import("twilio").Twilio} client
 * @property {string} accountSid
 * @property {string | null} apiKeySid
 * @property {string | null} apiKeySecret
 * @property {number | null} managerId
 * @property {string | null} defaultFromNumber
 */

function isCompleteManagerTwilioAccount(row) {
  return Boolean(
    row &&
      String(row.accountSid || "").trim() &&
      String(row.authToken || "").trim() &&
      String(row.apiKeySid || "").trim() &&
      String(row.apiKeySecret || "").trim(),
  );
}

/** Manager id for team dialing: self if manager, else managerId. */
export function resolveTeamManagerId(user) {
  if (!user) return null;
  if (user.role === "manager") {
    const id = Number(user.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  }
  const managerId = Number(user.managerId);
  return Number.isInteger(managerId) && managerId > 0 ? managerId : null;
}

/**
 * Resolve Twilio REST client + Voice API keys for a user.
 * Team subaccount only when an **admin** has saved a complete ManagerTwilioAccounts row
 * for that user's manager. Managers must not add, edit, or see credentials / number linking
 * (admin-only APIs and UI). Otherwise main account.
 * @param {object} user – at least `{ id, role, managerId? }`
 * @returns {Promise<TeamTwilioContext>}
 */
export async function getTeamTwilioContext(user) {
  const managerId = resolveTeamManagerId(user);
  if (managerId) {
    const row = await db.ManagerTwilioAccount.findOne({
      where: { managerId },
    });
    if (isCompleteManagerTwilioAccount(row)) {
      const accountSid = String(row.accountSid).trim();
      const authToken = String(row.authToken).trim();
      return {
        mode: "team",
        client: twilio(accountSid, authToken),
        accountSid,
        apiKeySid: String(row.apiKeySid).trim(),
        apiKeySecret: String(row.apiKeySecret).trim(),
        managerId,
        defaultFromNumber: row.defaultFromNumber
          ? String(row.defaultFromNumber).trim()
          : null,
      };
    }
  }

  const creds = await resolveMainTwilioCredentials();
  const client = await getTwilioClient();
  return {
    mode: "main",
    client,
    accountSid: creds.accountSid || "",
    apiKeySid: creds.apiKeySid,
    apiKeySecret: creds.apiKeySecret,
    managerId: null,
    defaultFromNumber: creds.phoneNumber,
  };
}

/**
 * Line 1 From: assigned → team default → main default From.
 * @param {object} user
 * @param {TeamTwilioContext} ctx
 */
export async function resolveFromNumberLine1(user, ctx) {
  const assigned = String(user?.twilioFromNumber || "").trim();
  if (assigned) return assigned;
  if (ctx?.mode === "team") {
    const teamDefault = String(ctx.defaultFromNumber || "").trim();
    if (teamDefault) return teamDefault;
    throw new Error(
      "No Line 1 Twilio number assigned. Assign a number or set the team default From.",
    );
  }
  return await getTwilioFromNumber();
}

/**
 * Line 2 From: assigned → main Line 2; team mode requires assignment.
 * @param {object} user
 * @param {TeamTwilioContext} ctx
 */
export async function resolveFromNumberLine2(user, ctx) {
  const assigned = String(user?.twilioFromNumberLine2 || "").trim();
  if (assigned) return assigned;
  if (ctx?.mode === "team") {
    throw new Error(
      "No Line 2 Twilio number assigned. Assign a Line 2 number for this team user.",
    );
  }
  return await getTwilioLine2FromNumber();
}

/**
 * List Incoming Phone Numbers on a Twilio account.
 * @param {import("twilio").Twilio} client
 * @returns {Promise<Array<{ phoneNumber: string, sid: string, friendlyName: string | null }>>}
 */
export async function listIncomingNumbers(client) {
  if (!client?.incomingPhoneNumbers?.list) {
    throw new Error("Twilio client is required to list incoming numbers.");
  }
  const numbers = await client.incomingPhoneNumbers.list({ limit: 1000 });
  return (numbers || [])
    .map((n) => ({
      phoneNumber: String(n.phoneNumber || "").trim(),
      sid: String(n.sid || "").trim(),
      friendlyName: n.friendlyName != null ? String(n.friendlyName) : null,
    }))
    .filter((n) => n.phoneNumber && n.sid);
}
