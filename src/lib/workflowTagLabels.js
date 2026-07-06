export const ADMIN_SHORT_LABELS_STORAGE_KEY = "leads-admin-short-labels";

export function resolvePreferShortLabels(isAdmin, adminPreferShort = false) {
  return !isAdmin || Boolean(adminPreferShort);
}

export function buildWorkflowTagLookup(tags) {
  const byCategory = {};
  for (const tag of tags || []) {
    if (!byCategory[tag.category]) byCategory[tag.category] = {};
    byCategory[tag.category][tag.tagKey] = tag;
  }
  return byCategory;
}

export function workflowTagDisplayLabel(lookup, category, tagKey, { preferShort = true, fallback = "—" } = {}) {
  const row = lookup?.[category]?.[String(tagKey || "").toLowerCase()];
  if (!row) return fallback || tagKey || "—";
  return preferShort ? row.shortLabel : row.fullLabel;
}

export function workflowTagAdminLabel(lookup, category, tagKey, fallback = "—") {
  const row = lookup?.[category]?.[String(tagKey || "").toLowerCase()];
  if (!row) return fallback || tagKey || "—";
  return `${row.fullLabel} (${row.shortLabel})`;
}

export function workflowTagTone(lookup, category, tagKey, fallback = "zinc") {
  return lookup?.[category]?.[String(tagKey || "").toLowerCase()]?.tone || fallback;
}

export function formatLeadWorkflowSummaryWithTags(lead, lookup, preferShort = true) {
  const parts = [];
  parts.push(
    workflowTagDisplayLabel(lookup, "phase", lead?.leadPhase || "active", { preferShort, fallback: "Active" }),
  );

  for (const tag of lead?.leadProgressTags || []) {
    parts.push(workflowTagDisplayLabel(lookup, "progress", tag, { preferShort, fallback: tag }));
  }

  if (lead?.leadContactTag) {
    const counts = lead?.leadContactCounts || {};
    const count = counts[lead.leadContactTag] || 0;
    const label = workflowTagDisplayLabel(lookup, "contact", lead.leadContactTag, {
      preferShort,
      fallback: lead.leadContactTag,
    });
    parts.push(count > 1 ? `${label} ×${count}` : label);
  }

  if (lead?.leadPaymentMethod) {
    parts.push(
      workflowTagDisplayLabel(lookup, "payment", lead.leadPaymentMethod, {
        preferShort,
        fallback: lead.leadPaymentMethod,
      }),
    );
  }

  return parts.join(" · ");
}

export function formatLeadWorkflowTooltipSummary(lead, lookup, preferShort = true) {
  return formatLeadWorkflowSummaryWithTags(lead, lookup, preferShort);
}

export function formatLeadStatusShortWithTags(lead, lookup, preferShort = true) {
  return workflowTagDisplayLabel(lookup, "phase", lead?.leadPhase || "active", { preferShort, fallback: "Active" });
}

export function collectLeadWorkflowIndicators(lead, lookup, preferShort = true) {
  const items = [];
  const phase = lead?.leadPhase || "active";

  items.push({
    category: "phase",
    tagKey: phase,
    tone: workflowTagTone(lookup, "phase", phase),
    label: workflowTagDisplayLabel(lookup, "phase", phase, { preferShort, fallback: "Active" }),
  });

  for (const tag of lead?.leadProgressTags || []) {
    items.push({
      category: "progress",
      tagKey: tag,
      tone: workflowTagTone(lookup, "progress", tag),
      label: workflowTagDisplayLabel(lookup, "progress", tag, { preferShort, fallback: tag }),
    });
  }

  if (lead?.leadContactTag) {
    const counts = lead?.leadContactCounts || {};
    const count = counts[lead.leadContactTag] || 0;
    const label = workflowTagDisplayLabel(lookup, "contact", lead.leadContactTag, {
      preferShort,
      fallback: lead.leadContactTag,
    });
    items.push({
      category: "contact",
      tagKey: lead.leadContactTag,
      tone: workflowTagTone(lookup, "contact", lead.leadContactTag),
      label: count > 1 ? `${label} ×${count}` : label,
    });
  }

  if (lead?.leadPaymentMethod) {
    items.push({
      category: "payment",
      tagKey: lead.leadPaymentMethod,
      tone: workflowTagTone(lookup, "payment", lead.leadPaymentMethod),
      label: workflowTagDisplayLabel(lookup, "payment", lead.leadPaymentMethod, {
        preferShort,
        fallback: lead.leadPaymentMethod,
      }),
    });
  }

  return items;
}

export function formatActivityBodyWithTags(body, lookup, preferShort = true) {
  if (!body || !preferShort) return body;
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
