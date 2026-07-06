import db from "@/server/db";
import { WORKFLOW_TAG_SEEDS } from "@/server/workflowTags/defaults";

let cache = null;
let cacheAt = 0;
const CACHE_MS = 30_000;

function seedMap() {
  const byCategory = {};
  for (const row of WORKFLOW_TAG_SEEDS) {
    if (!byCategory[row.category]) byCategory[row.category] = {};
    byCategory[row.category][row.tagKey] = { ...row };
  }
  return byCategory;
}

function buildRegistry(rows) {
  const registry = seedMap();
  for (const row of rows) {
    const plain = row.get ? row.get({ plain: true }) : row;
    const category = plain.category;
    const tagKey = plain.tagKey;
    if (!registry[category]) registry[category] = {};
    registry[category][tagKey] = {
      id: plain.id,
      category,
      tagKey,
      fullLabel: plain.fullLabel,
      shortLabel: plain.shortLabel,
      tone: plain.tone,
      sortOrder: plain.sortOrder,
    };
  }
  return registry;
}

export function invalidateWorkflowTagRegistry() {
  cache = null;
  cacheAt = 0;
}

export async function getWorkflowTagRegistry() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  try {
    const rows = await db.WorkflowTag.findAll({ order: [["sortOrder", "ASC"], ["id", "ASC"]] });
    cache = buildRegistry(rows);
  } catch {
    cache = seedMap();
  }
  cacheAt = Date.now();
  return cache;
}

export function getWorkflowTagFromRegistry(registry, category, tagKey) {
  return registry?.[category]?.[String(tagKey || "").toLowerCase()] || null;
}

export function workflowTagFullLabel(registry, category, tagKey, fallback = "—") {
  return getWorkflowTagFromRegistry(registry, category, tagKey)?.fullLabel || fallback;
}

export function workflowTagShortLabel(registry, category, tagKey, fallback = "—") {
  return getWorkflowTagFromRegistry(registry, category, tagKey)?.shortLabel || fallback;
}

export function workflowTagTone(registry, category, tagKey, fallback = "zinc") {
  return getWorkflowTagFromRegistry(registry, category, tagKey)?.tone || fallback;
}

export function serializeWorkflowTagRow(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  return {
    id: plain.id,
    category: plain.category,
    tagKey: plain.tagKey,
    fullLabel: plain.fullLabel,
    shortLabel: plain.shortLabel,
    tone: plain.tone,
    sortOrder: plain.sortOrder,
    updatedAt: plain.updatedAt,
  };
}

export async function listWorkflowTags() {
  try {
    const rows = await db.WorkflowTag.findAll({ order: [["category", "ASC"], ["sortOrder", "ASC"], ["id", "ASC"]] });
    return rows.map(serializeWorkflowTagRow);
  } catch {
    return WORKFLOW_TAG_SEEDS.map((row, index) => ({
      id: index + 1,
      ...row,
      updatedAt: null,
    }));
  }
}
