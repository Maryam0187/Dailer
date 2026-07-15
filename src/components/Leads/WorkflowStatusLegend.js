"use client";

import { WORKFLOW_BADGE_CLASS } from "@/lib/leadWorkflow";
import WorkflowSwatch from "@/components/Leads/WorkflowSwatch";
import { WORKFLOW_TAG_CATEGORY_LABELS } from "@/lib/workflowTagLabels";

const CATEGORY_ORDER = ["phase", "progress", "contact", "payment"];

function groupWorkflowTags(tags) {
  const grouped = {};
  for (const tag of tags || []) {
    if (!grouped[tag.category]) grouped[tag.category] = [];
    grouped[tag.category].push(tag);
  }
  for (const category of Object.keys(grouped)) {
    grouped[category].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }
  return CATEGORY_ORDER.filter((category) => grouped[category]?.length).map((category) => ({
    category,
    tags: grouped[category],
  }));
}

function LegendItem({ tag, category, preferShortLabels }) {
  const tone = tag.tone || "zinc";
  const displayLabel = preferShortLabels ? tag.shortLabel : tag.fullLabel;
  const tooltipLabel = preferShortLabels ? tag.shortLabel : tag.fullLabel;
  if (category === "phase") {
    return (
      <span title={tooltipLabel}>
        <span
          className={`inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none ${WORKFLOW_BADGE_CLASS[tone] || WORKFLOW_BADGE_CLASS.zinc}`}
        >
          {displayLabel}
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1" title={tooltipLabel}>
      <WorkflowSwatch category={category} tagKey={tag.tagKey} tone={tone} title={tooltipLabel} />
      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{displayLabel}</span>
    </span>
  );
}

export default function WorkflowStatusLegend({ workflowTags = [], preferShortLabels = true }) {
  const groups = groupWorkflowTags(workflowTags);
  if (!groups.length) return null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950/40">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Status key
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {groups.map(({ category, tags }) => (
          <div key={category} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              {WORKFLOW_TAG_CATEGORY_LABELS[category] || category}
            </span>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {tags.map((tag) => (
                <LegendItem
                  key={tag.id || `${category}-${tag.tagKey}`}
                  tag={tag}
                  category={category}
                  preferShortLabels={preferShortLabels}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
