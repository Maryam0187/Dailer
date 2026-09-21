import db from "@/server/db";

const { DEFAULT_ADDRESS_BOT_INSTRUCTIONS } = require("./addressBotCore.cjs");

export const ADDRESS_BOT_NAME_DEFAULT = "Address Assistant";
export { DEFAULT_ADDRESS_BOT_INSTRUCTIONS };
export const ADDRESS_BOT_NAME_MAX = 64;
export const ADDRESS_BOT_INSTRUCTIONS_MAX = 8000;
export const ADDRESS_BOT_QUESTION_MAX = 500;
export const ADDRESS_BOT_ANSWER_MAX = 1000;
const SUMMARY_MAX = 400;

function trimField(value, maxLen) {
  if (value == null) return "";
  return String(value).trim().slice(0, maxLen);
}

function clipSummary(text) {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= SUMMARY_MAX) return t;
  return `${t.slice(0, SUMMARY_MAX - 1)}…`;
}

export async function getOrCreateAddressBotProfile() {
  let row = await db.AddressBotProfile.findOne({ order: [["id", "ASC"]] });
  if (!row) {
    row = await db.AddressBotProfile.create({
      name: ADDRESS_BOT_NAME_DEFAULT,
      instructions: "",
      updatedBy: null,
    });
  }
  return row;
}

export function serializeAddressBotProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || ADDRESS_BOT_NAME_DEFAULT,
    instructions: String(row.instructions || "").trim() || DEFAULT_ADDRESS_BOT_INSTRUCTIONS,
    updatedBy: row.updatedBy ?? null,
    updatedByUsername: row.updatedByUser?.username ?? null,
    updatedAt: row.updatedAt || null,
  };
}

export function serializeAddressBotExample(row) {
  if (!row) return null;
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    updatedBy: row.updatedBy ?? null,
    updatedByUsername: row.updatedByUser?.username ?? null,
    updatedAt: row.updatedAt || null,
  };
}

export function serializeAddressBotChange(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId ?? null,
    username: row.user?.username ?? null,
    action: row.action,
    summary: row.summary,
    createdAt: row.createdAt,
  };
}

export function parseAddressBotProfileBody(body) {
  const src = body && typeof body === "object" ? body : {};
  const errors = [];
  const data = {};

  if (src.name !== undefined) {
    const name = trimField(src.name, ADDRESS_BOT_NAME_MAX) || ADDRESS_BOT_NAME_DEFAULT;
    data.name = name;
  }

  if (src.instructions !== undefined) {
    if (src.instructions != null && typeof src.instructions !== "string") {
      errors.push("Instructions must be text");
    } else {
      data.instructions = trimField(src.instructions, ADDRESS_BOT_INSTRUCTIONS_MAX);
    }
  }

  if (!Object.keys(data).length) {
    errors.push("No fields to update");
  }

  return { data, errors };
}

export function parseAddressBotExampleBody(body, { requireAll = true } = {}) {
  const src = body && typeof body === "object" ? body : {};
  const errors = [];
  const data = {};

  if (src.question !== undefined || requireAll) {
    const question = trimField(src.question, ADDRESS_BOT_QUESTION_MAX);
    if (!question) errors.push("Question is required");
    else data.question = question;
  }

  if (src.answer !== undefined || requireAll) {
    const answer = trimField(src.answer, ADDRESS_BOT_ANSWER_MAX);
    if (!answer) errors.push("Answer is required");
    else data.answer = answer;
  }

  return { data, errors };
}

export async function recordAddressBotTrainingChange({ userId, action, summary }) {
  await db.AddressBotTrainingChange.create({
    userId: userId ?? null,
    action: String(action || "update").slice(0, 32),
    summary: clipSummary(summary) || "(no text)",
  });
}

export const exampleUserInclude = {
  association: "updatedByUser",
  attributes: ["id", "username"],
  required: false,
};

export const profileUserInclude = {
  association: "updatedByUser",
  attributes: ["id", "username"],
  required: false,
};

export const changeUserInclude = {
  association: "user",
  attributes: ["id", "username"],
  required: false,
};
