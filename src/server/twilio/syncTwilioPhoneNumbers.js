import twilio from "twilio";
import db from "@/server/db";
import { getTwilioClient } from "@/server/twilio";
import { listIncomingNumbers } from "@/server/twilioTeam";
import { normalizeToE164 } from "@/server/calls/normalizePhone";

function isCompleteManagerTwilioAccount(row) {
  return Boolean(
    row &&
      String(row.accountSid || "").trim() &&
      String(row.authToken || "").trim() &&
      String(row.apiKeySid || "").trim() &&
      String(row.apiKeySecret || "").trim(),
  );
}

/**
 * Upsert fetched numbers into TwilioPhoneNumbers. No auto-delete.
 * Does not touch Users.twilioFromNumber* (assignees).
 * @param {Array<{ phoneNumber: string, sid: string, friendlyName: string | null }>} numbers
 * @param {{ accountKind: "main" | "team", managerId: number | null }} account
 */
export async function upsertTwilioPhoneNumbers(numbers, { accountKind, managerId }) {
  let created = 0;
  let updated = 0;
  const phoneNumbers = [];

  for (const item of numbers || []) {
    const raw = String(item.phoneNumber || "").trim();
    const phoneNumber = normalizeToE164(raw) || raw;
    if (!phoneNumber) continue;

    const twilioSid = String(item.sid || "").trim() || null;
    const friendlyName = item.friendlyName != null ? String(item.friendlyName).slice(0, 128) : null;

    const existing = await db.TwilioPhoneNumber.findOne({ where: { phoneNumber } });
    if (existing) {
      await existing.update({
        accountKind,
        managerId: accountKind === "team" ? managerId : null,
        twilioSid: twilioSid || existing.twilioSid,
        friendlyName: friendlyName ?? existing.friendlyName,
      });
      updated += 1;
      phoneNumbers.push(phoneNumber);
    } else {
      await db.TwilioPhoneNumber.create({
        phoneNumber,
        accountKind,
        managerId: accountKind === "team" ? managerId : null,
        twilioSid,
        friendlyName,
      });
      created += 1;
      phoneNumbers.push(phoneNumber);
    }
  }

  return { created, updated, count: phoneNumbers.length, phoneNumbers };
}

async function syncMainAccount() {
  try {
    const client = await getTwilioClient();
    const numbers = await listIncomingNumbers(client);
    const result = await upsertTwilioPhoneNumbers(numbers, {
      accountKind: "main",
      managerId: null,
    });
    return {
      scope: "main",
      managerId: null,
      ok: true,
      fetched: numbers.length,
      ...result,
      error: null,
    };
  } catch (err) {
    return {
      scope: "main",
      managerId: null,
      ok: false,
      fetched: 0,
      created: 0,
      updated: 0,
      count: 0,
      phoneNumbers: [],
      error: err?.message || "Failed to sync main Twilio account",
    };
  }
}

async function syncTeamAccount(row, managerUsername = null) {
  const managerId = Number(row.managerId);
  const label = {
    scope: "team",
    managerId,
    managerUsername: managerUsername || null,
  };
  if (!isCompleteManagerTwilioAccount(row)) {
    return {
      ...label,
      ok: false,
      fetched: 0,
      created: 0,
      updated: 0,
      count: 0,
      phoneNumbers: [],
      error: "Manager Twilio account credentials are incomplete",
    };
  }
  try {
    const client = twilio(String(row.accountSid).trim(), String(row.authToken).trim());
    const numbers = await listIncomingNumbers(client);
    const result = await upsertTwilioPhoneNumbers(numbers, {
      accountKind: "team",
      managerId,
    });
    return {
      ...label,
      ok: true,
      fetched: numbers.length,
      ...result,
      error: null,
    };
  } catch (err) {
    return {
      ...label,
      ok: false,
      fetched: 0,
      created: 0,
      updated: 0,
      count: 0,
      phoneNumbers: [],
      error: err?.message || "Failed to sync team Twilio account",
    };
  }
}

/**
 * Sync Incoming Phone Numbers from Twilio into local inventory.
 * @param {{ scope?: "main" | "team" | "all", managerId?: number }} opts
 */
export async function syncTwilioPhoneNumbers({ scope = "all", managerId = null } = {}) {
  const accounts = [];

  if (scope === "main" || scope === "all") {
    accounts.push(await syncMainAccount());
  }

  if (scope === "team" || scope === "all") {
    if (scope === "team") {
      const id = Number(managerId);
      if (!Number.isInteger(id) || id < 1) {
        return {
          ok: false,
          error: "managerId is required when scope is team",
          accounts: [],
        };
      }
      const row = await db.ManagerTwilioAccount.findOne({ where: { managerId: id } });
      if (!row) {
        return {
          ok: false,
          error: "No Twilio subaccount configured for this manager",
          accounts: [],
        };
      }
      const manager = await db.User.findByPk(id, { attributes: ["id", "username"] });
      accounts.push(await syncTeamAccount(row, manager?.username || null));
    } else {
      const rows = await db.ManagerTwilioAccount.findAll();
      const managerIds = rows.map((r) => r.managerId);
      const managers =
        managerIds.length > 0
          ? await db.User.findAll({
              where: { id: managerIds },
              attributes: ["id", "username"],
            })
          : [];
      const nameById = new Map(managers.map((m) => [m.id, m.username]));
      for (const row of rows) {
        accounts.push(await syncTeamAccount(row, nameById.get(row.managerId) || null));
      }
    }
  }

  if (scope !== "main" && scope !== "team" && scope !== "all") {
    return { ok: false, error: 'scope must be "main", "team", or "all"', accounts: [] };
  }

  const anyOk = accounts.some((a) => a.ok);
  const allOk = accounts.length > 0 && accounts.every((a) => a.ok);
  return {
    ok: anyOk,
    allOk,
    accounts,
    error: accounts.length === 0 ? "Nothing to sync" : null,
  };
}
