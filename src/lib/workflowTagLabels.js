export function buildWorkflowTagLookup(tags) {
  const byCategory = {};
  for (const tag of tags || []) {
    if (!byCategory[tag.category]) byCategory[tag.category] = {};
    byCategory[tag.category][tag.tagKey] = tag;
  }
  return byCategory;
}

export function workflowTagDisplayLabel(lookup, category, tagKey, { isAdmin = false, fallback = "—" } = {}) {
  const row = lookup?.[category]?.[String(tagKey || "").toLowerCase()];
  if (!row) return fallback || tagKey || "—";
  return isAdmin ? row.fullLabel : row.shortLabel;
}

export function workflowTagAdminLabel(lookup, category, tagKey, fallback = "—") {
  const row = lookup?.[category]?.[String(tagKey || "").toLowerCase()];
  if (!row) return fallback || tagKey || "—";
  return `${row.fullLabel} (${row.shortLabel})`;
}

export function workflowTagTone(lookup, category, tagKey, fallback = "zinc") {
  return lookup?.[category]?.[String(tagKey || "").toLowerCase()]?.tone || fallback;
}

export function formatLeadWorkflowSummaryWithTags(lead, lookup, isAdmin) {
  const parts = [];
  parts.push(workflowTagDisplayLabel(lookup, "phase", lead?.leadPhase || "active", { isAdmin, fallback: "Active" }));

  for (const tag of lead?.leadProgressTags || []) {
    parts.push(workflowTagDisplayLabel(lookup, "progress", tag, { isAdmin, fallback: tag }));
  }

  if (lead?.leadContactTag) {
    const counts = lead?.leadContactCounts || {};
    const count = counts[lead.leadContactTag] || 0;
    const label = workflowTagDisplayLabel(lookup, "contact", lead.leadContactTag, {
      isAdmin,
      fallback: lead.leadContactTag,
    });
    parts.push(count > 1 ? `${label} ×${count}` : label);
  }

  if (lead?.leadPaymentMethod) {
    parts.push(
      workflowTagDisplayLabel(lookup, "payment", lead.leadPaymentMethod, {
        isAdmin,
        fallback: lead.leadPaymentMethod,
      }),
    );
  }

  return parts.join(" · ");
}

export function formatLeadStatusShortWithTags(lead, lookup, isAdmin) {
  return workflowTagDisplayLabel(lookup, "phase", lead?.leadPhase || "active", { isAdmin, fallback: "Active" });
}

export function formatActivityBodyWithTags(body, lookup, isAdmin) {
  if (!body || isAdmin) return body;
  let text = body;
  const replacements = [];
  for (const category of Object.keys(lookup || {})) {
    for (const row of Object.values(lookup[category] || {})) {
      if (row.fullLabel && row.shortLabel && row.fullLabel !== row.shortLabel) {
        replacements.push({ from: row.fullLabel, to: row.shortLabel });
      }
    }
  }
  replacements.sort((a, b) => b.from.length - a.from.length);
  for (const { from, to } of replacements) {
    text = text.split(from).join(to);
  }
  return text;
}

export const WORKFLOW_TAG_CATEGORY_LABELS = {
  phase: "Sale status",
  progress: "Progress",
  contact: "Call outcome",
  payment: "Payment",
};
