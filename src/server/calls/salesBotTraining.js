import db from "@/server/db";

const {
  DEFAULT_SALES_BOT_INSTRUCTIONS,
  normalizeSalesBotKey,
  defaultSalesBotName,
  SALES_BOT_KEY_PRIMARY,
  SALES_BOT_KEY_SECONDARY,
} = require("./salesBotCore.cjs");

export const SALES_BOT_NAME_DEFAULT = "Sales Assistant";
export const SALES_BOT_SECONDARY_NAME = "Sales Bot 2";
export { DEFAULT_SALES_BOT_INSTRUCTIONS, normalizeSalesBotKey, defaultSalesBotName };
export { SALES_BOT_KEY_PRIMARY, SALES_BOT_KEY_SECONDARY };
export const SALES_BOT_NAME_MAX = 64;
export const SALES_BOT_INSTRUCTIONS_MAX = 8000;
export const SALES_BOT_QUESTION_MAX = 500;
export const SALES_BOT_ANSWER_MAX = 1000;
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

export async function getOrCreateSalesBotProfile(botKey) {
  const key = normalizeSalesBotKey(botKey);
  let row = await db.SalesBotProfile.findOne({ where: { botKey: key } });
  if (!row) {
    row = await db.SalesBotProfile.create({
      botKey: key,
      name: defaultSalesBotName(key),
      instructions: "",
      updatedBy: null,
    });
  }
  return row;
}

export function serializeSalesBotProfile(row) {
  if (!row) return null;
  const key = normalizeSalesBotKey(row.botKey);
  return {
    id: row.id,
    botKey: key,
    name: row.name || defaultSalesBotName(key),
    instructions: String(row.instructions || "").trim() || DEFAULT_SALES_BOT_INSTRUCTIONS,
    updatedBy: row.updatedBy ?? null,
    updatedByUsername: row.updatedByUser?.username ?? null,
    updatedAt: row.updatedAt || null,
  };
}

export function serializeSalesBotExample(row) {
  if (!row) return null;
  return {
    id: row.id,
    botKey: normalizeSalesBotKey(row.botKey),
    question: row.question,
    answer: row.answer,
    updatedBy: row.updatedBy ?? null,
    updatedByUsername: row.updatedByUser?.username ?? null,
    updatedAt: row.updatedAt || null,
  };
}

export function serializeSalesBotChange(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId ?? null,
    username: row.user?.username ?? null,
    botKey: normalizeSalesBotKey(row.botKey),
    action: row.action,
    summary: row.summary,
    createdAt: row.createdAt,
  };
}

export function parseSalesBotProfileBody(body, { botKey } = {}) {
  const src = body && typeof body === "object" ? body : {};
  const errors = [];
  const data = {};
  const fallbackName = defaultSalesBotName(botKey);

  if (src.name !== undefined) {
    const name = trimField(src.name, SALES_BOT_NAME_MAX) || fallbackName;
    data.name = name;
  }

  if (src.instructions !== undefined) {
    if (src.instructions != null && typeof src.instructions !== "string") {
      errors.push("Instructions must be text");
    } else {
      data.instructions = trimField(src.instructions, SALES_BOT_INSTRUCTIONS_MAX);
    }
  }

  if (!Object.keys(data).length) {
    errors.push("No fields to update");
  }

  return { data, errors };
}

export function parseSalesBotExampleBody(body, { requireAll = true } = {}) {
  const src = body && typeof body === "object" ? body : {};
  const errors = [];
  const data = {};

  if (src.question !== undefined || requireAll) {
    const question = trimField(src.question, SALES_BOT_QUESTION_MAX);
    if (!question) errors.push("Question is required");
    else data.question = question;
  }

  if (src.answer !== undefined || requireAll) {
    const answer = trimField(src.answer, SALES_BOT_ANSWER_MAX);
    if (!answer) errors.push("Answer is required");
    else data.answer = answer;
  }

  return { data, errors };
}

export async function recordSalesBotTrainingChange({ userId, action, summary, botKey }) {
  await db.SalesBotTrainingChange.create({
    userId: userId ?? null,
    botKey: normalizeSalesBotKey(botKey),
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
