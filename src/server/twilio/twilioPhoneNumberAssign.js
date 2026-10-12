import { Op } from "sequelize";
import db from "@/server/db";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { getTeamTwilioContext, resolveTeamManagerId } from "@/server/twilioTeam";

function normalizePhoneOrError(raw) {
  const phoneNumber = normalizeToE164(raw) || String(raw || "").trim();
  if (!phoneNumber || !phoneNumber.startsWith("+")) {
    return { error: "phoneNumber must be a valid E.164 number" };
  }
  return { phoneNumber };
}

/**
 * Find who currently has this number on Line 1 or Line 2.
 * @returns {Promise<Array<{ userId: number, username: string, line: 1 | 2 }>>}
 */
export async function findAssigneesForPhoneNumber(phoneNumber) {
  const users = await db.User.findAll({
    where: {
      [Op.or]: [{ twilioFromNumber: phoneNumber }, { twilioFromNumberLine2: phoneNumber }],
    },
    attributes: ["id", "username", "twilioFromNumber", "twilioFromNumberLine2"],
  });
  const assignees = [];
  for (const u of users) {
    if (u.twilioFromNumber === phoneNumber) {
      assignees.push({ userId: u.id, username: u.username, line: 1 });
    }
    if (u.twilioFromNumberLine2 === phoneNumber) {
      assignees.push({ userId: u.id, username: u.username, line: 2 });
    }
  }
  return assignees;
}

export async function listTwilioPhoneNumbersInventory() {
  const rows = await db.TwilioPhoneNumber.findAll({
    order: [
      ["accountKind", "ASC"],
      ["managerId", "ASC"],
      ["phoneNumber", "ASC"],
    ],
    include: [
      {
        model: db.User,
        as: "manager",
        attributes: ["id", "username"],
        required: false,
      },
    ],
  });

  const phones = rows.map((r) => r.phoneNumber);
  const assigneeByPhone = new Map();
  if (phones.length > 0) {
    const users = await db.User.findAll({
      where: {
        [Op.or]: [
          { twilioFromNumber: { [Op.in]: phones } },
          { twilioFromNumberLine2: { [Op.in]: phones } },
        ],
      },
      attributes: ["id", "username", "twilioFromNumber", "twilioFromNumberLine2"],
    });
    for (const u of users) {
      if (u.twilioFromNumber) {
        const list = assigneeByPhone.get(u.twilioFromNumber) || [];
        list.push({ userId: u.id, username: u.username, line: 1 });
        assigneeByPhone.set(u.twilioFromNumber, list);
      }
      if (u.twilioFromNumberLine2) {
        const list = assigneeByPhone.get(u.twilioFromNumberLine2) || [];
        list.push({ userId: u.id, username: u.username, line: 2 });
        assigneeByPhone.set(u.twilioFromNumberLine2, list);
      }
    }
  }

  return rows.map((r) => ({
    id: r.id,
    phoneNumber: r.phoneNumber,
    accountKind: r.accountKind,
    managerId: r.managerId,
    managerUsername: r.manager?.username || null,
    twilioSid: r.twilioSid,
    friendlyName: r.friendlyName,
    label: r.label,
    assignees: assigneeByPhone.get(r.phoneNumber) || [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Validate number account vs user dial context.
 * @returns {Promise<{ error?: string }>}
 */
export async function assertNumberAssignableToUser(inventoryRow, user) {
  const ctx = await getTeamTwilioContext(user);
  if (inventoryRow.accountKind === "main") {
    if (ctx.mode !== "main") {
      return {
        error:
          "This number belongs to the main Twilio account and cannot be assigned to a team-subaccount user",
      };
    }
    return {};
  }

  if (inventoryRow.accountKind === "team") {
    if (ctx.mode !== "team") {
      return {
        error:
          "This number belongs to a team subaccount; the user must dial on that team (manager needs Twilio credentials)",
      };
    }
    if (Number(ctx.managerId) !== Number(inventoryRow.managerId)) {
      return { error: "This number belongs to a different manager's team" };
    }
    return {};
  }

  return { error: "Unknown accountKind on inventory number" };
}

/**
 * @param {{ phoneNumber: string, userId: number, line: 1 | 2 }} opts
 */
export async function assignTwilioPhoneNumber({ phoneNumber: rawPhone, userId, line }) {
  const normalized = normalizePhoneOrError(rawPhone);
  if (normalized.error) return { error: normalized.error, status: 400 };
  const phoneNumber = normalized.phoneNumber;

  const lineNum = Number(line);
  if (lineNum !== 1 && lineNum !== 2) {
    return { error: "line must be 1 or 2", status: 400 };
  }

  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) {
    return { error: "userId is required", status: 400 };
  }

  const inventory = await db.TwilioPhoneNumber.findOne({ where: { phoneNumber } });
  if (!inventory) {
    return { error: "Number not found in inventory. Sync or add it first.", status: 404 };
  }

  const user = await db.User.findByPk(uid, {
    attributes: [
      "id",
      "username",
      "role",
      "managerId",
      "twilioFromNumber",
      "twilioFromNumberLine2",
      "canUseDialer2",
    ],
  });
  if (!user) return { error: "User not found", status: 404 };

  if (lineNum === 2 && !user.canUseDialer2) {
    return { error: "User does not have the second dialer enabled", status: 400 };
  }

  const fit = await assertNumberAssignableToUser(inventory, user);
  if (fit.error) return { error: fit.error, status: 400 };

  const assignees = await findAssigneesForPhoneNumber(phoneNumber);
  const conflict = assignees.find((a) => !(a.userId === uid && a.line === lineNum));
  if (conflict) {
    return {
      error: `Number is already assigned to ${conflict.username} (Line ${conflict.line})`,
      status: 409,
    };
  }

  const field = lineNum === 1 ? "twilioFromNumber" : "twilioFromNumberLine2";
  // Clear this line if it had another number; set new one.
  await user.update({ [field]: phoneNumber });

  return {
    ok: true,
    assignment: {
      phoneNumber,
      userId: user.id,
      username: user.username,
      line: lineNum,
      accountKind: inventory.accountKind,
      managerId: inventory.managerId,
    },
  };
}

/**
 * @param {{ userId: number, line: 1 | 2 } | { phoneNumber: string }} opts
 */
export async function unassignTwilioPhoneNumber(opts) {
  if (opts?.phoneNumber) {
    const normalized = normalizePhoneOrError(opts.phoneNumber);
    if (normalized.error) return { error: normalized.error, status: 400 };
    const phoneNumber = normalized.phoneNumber;
    const users = await db.User.findAll({
      where: {
        [Op.or]: [{ twilioFromNumber: phoneNumber }, { twilioFromNumberLine2: phoneNumber }],
      },
    });
    for (const u of users) {
      const patch = {};
      if (u.twilioFromNumber === phoneNumber) patch.twilioFromNumber = null;
      if (u.twilioFromNumberLine2 === phoneNumber) patch.twilioFromNumberLine2 = null;
      if (Object.keys(patch).length) await u.update(patch);
    }
    return { ok: true, cleared: users.length, phoneNumber };
  }

  const uid = Number(opts?.userId);
  const lineNum = Number(opts?.line);
  if (!Number.isInteger(uid) || uid < 1) {
    return { error: "userId or phoneNumber is required", status: 400 };
  }
  if (lineNum !== 1 && lineNum !== 2) {
    return { error: "line must be 1 or 2 when unassigning by user", status: 400 };
  }

  const user = await db.User.findByPk(uid);
  if (!user) return { error: "User not found", status: 404 };

  const field = lineNum === 1 ? "twilioFromNumber" : "twilioFromNumberLine2";
  const previous = user[field];
  await user.update({ [field]: null });
  return { ok: true, userId: uid, line: lineNum, previousPhoneNumber: previous };
}

/**
 * Manual inventory add (fallback when Twilio fetch missed a number).
 */
export async function addTwilioPhoneNumberManual({
  phoneNumber: rawPhone,
  accountKind,
  managerId,
  label,
  friendlyName,
}) {
  const normalized = normalizePhoneOrError(rawPhone);
  if (normalized.error) return { error: normalized.error, status: 400 };
  const phoneNumber = normalized.phoneNumber;

  const kind = String(accountKind || "").trim();
  if (kind !== "main" && kind !== "team") {
    return { error: 'accountKind must be "main" or "team"', status: 400 };
  }

  let mid = null;
  if (kind === "team") {
    mid = Number(managerId);
    if (!Number.isInteger(mid) || mid < 1) {
      return { error: "managerId is required for team numbers", status: 400 };
    }
    const manager = await db.User.findByPk(mid, { attributes: ["id", "role"] });
    if (!manager || manager.role !== "manager") {
      return { error: "managerId must refer to a manager user", status: 400 };
    }
    const acct = await db.ManagerTwilioAccount.findOne({ where: { managerId: mid } });
    if (!acct) {
      return {
        error: "Attach Twilio subaccount credentials for this manager before adding team numbers",
        status: 400,
      };
    }
  }

  const existing = await db.TwilioPhoneNumber.findOne({ where: { phoneNumber } });
  if (existing) {
    return { error: "Number already exists in inventory", status: 409 };
  }

  const row = await db.TwilioPhoneNumber.create({
    phoneNumber,
    accountKind: kind,
    managerId: mid,
    label: label != null ? String(label).slice(0, 128) : null,
    friendlyName: friendlyName != null ? String(friendlyName).slice(0, 128) : null,
    twilioSid: null,
  });

  return {
    ok: true,
    number: {
      id: row.id,
      phoneNumber: row.phoneNumber,
      accountKind: row.accountKind,
      managerId: row.managerId,
      label: row.label,
      friendlyName: row.friendlyName,
      assignees: [],
    },
  };
}

export async function deleteTwilioPhoneNumberFromInventory({ id, phoneNumber: rawPhone }) {
  let row = null;
  if (id != null) {
    const nid = Number(id);
    if (!Number.isInteger(nid) || nid < 1) return { error: "Invalid id", status: 400 };
    row = await db.TwilioPhoneNumber.findByPk(nid);
  } else if (rawPhone) {
    const normalized = normalizePhoneOrError(rawPhone);
    if (normalized.error) return { error: normalized.error, status: 400 };
    row = await db.TwilioPhoneNumber.findOne({ where: { phoneNumber: normalized.phoneNumber } });
  } else {
    return { error: "id or phoneNumber is required", status: 400 };
  }

  if (!row) return { error: "Number not found", status: 404 };

  const assignees = await findAssigneesForPhoneNumber(row.phoneNumber);
  if (assignees.length > 0) {
    return {
      error: "Unassign this number from all users before deleting it from inventory",
      status: 409,
    };
  }

  await row.destroy();
  return { ok: true, deleted: true, phoneNumber: row.phoneNumber };
}

/** Exported for tests / diagnostics */
export { resolveTeamManagerId };
