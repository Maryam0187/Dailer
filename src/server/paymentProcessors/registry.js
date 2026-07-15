import db from "@/server/db";
import { PAYMENT_PROCESSOR_SEEDS } from "@/server/paymentProcessors/defaults";

let cache = null;
let cacheAt = 0;
const CACHE_MS = 30_000;

export function serializePaymentProcessor(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  return {
    id: plain.id ?? null,
    code: plain.code,
    fullName: plain.fullName,
    shortCode: plain.shortCode,
    tone: plain.tone || "zinc",
    sortOrder: plain.sortOrder ?? 0,
    active: plain.active !== false,
    updatedAt: plain.updatedAt ?? null,
  };
}

function seedList() {
  return PAYMENT_PROCESSOR_SEEDS.map((row, index) => ({
    id: index + 1,
    ...row,
    active: true,
    updatedAt: null,
  }));
}

export function invalidatePaymentProcessorRegistry() {
  cache = null;
  cacheAt = 0;
}

export async function listPaymentProcessors({ activeOnly = false } = {}) {
  try {
    const rows = await db.PaymentProcessor.findAll({
      order: [
        ["sortOrder", "ASC"],
        ["id", "ASC"],
      ],
    });
    const list = rows.map(serializePaymentProcessor);
    return activeOnly ? list.filter((p) => p.active) : list;
  } catch {
    const list = seedList();
    return activeOnly ? list.filter((p) => p.active) : list;
  }
}

export async function getPaymentProcessorRegistry() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  const list = await listPaymentProcessors({ activeOnly: false });
  cache = Object.fromEntries(list.map((p) => [p.code, p]));
  cacheAt = Date.now();
  return cache;
}

/** @returns {Promise<object|null>} resolved processor, or null if missing/inactive */
export async function resolvePaymentProcessor(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const code = String(raw).trim().toLowerCase();
  if (!code) return null;
  const registry = await getPaymentProcessorRegistry();
  const row = registry[code];
  if (!row || row.active === false) return null;
  return row;
}
