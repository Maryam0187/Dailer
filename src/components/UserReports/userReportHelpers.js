"use client";

import { stripHtml } from "@/lib/richText";
import { formatDuration } from "@/lib/formatDuration";
import { formatReportWhenDual } from "@/lib/attendanceTime";
import EtTimeWithTooltip from "@/components/EtTimeWithTooltip";

export function roleLabel(role) {
  if (role === "agent") return "Agent";
  if (role === "manager") return "Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "admin") return "Admin";
  if (role === "lead_supervisor") return "Lead Supervisor";
  if (role === "processor") return "Processor";
  return role;
}

export function activityActionLabel(action, metadata) {
  if (action === "login_success") return "Login";
  if (action === "login_failed") return "Login failed";
  if (action === "logout") return "Logout";
  if (action === "leave_application_submitted") return "Leave submitted";
  if (action === "leave_application_created") return "Leave marked by admin";
  if (action === "lead_created") return "Lead created";
  if (action === "lead_updated") return "Lead updated";
  if (action === "lead_status_change") return "Lead status changed";
  if (action === "lead_note_edit") return "Lead notes edited";
  if (action === "lead_breakdown_edit") return "Lead breakdown edited";
  if (action === "lead_workflow_change") {
    if (String(metadata?.summary || "").startsWith("Progress:")) {
      return "Lead progress tags updated";
    }
    return "Lead workflow updated";
  }
  if (action === "lead_comment") return "Lead comment";
  if (action === "lead_assigned") return "Lead assigned";
  if (action === "lead_processor_assigned") return "Processor assigned";
  if (action === "after_shift_access_granted") return "After-shift access granted";
  if (action === "after_shift_access_revoked") return "After-shift access revoked";
  if (action === "login_window_restriction_lifted") return "Login window restriction lifted";
  if (action === "login_window_restriction_added") return "Login window restriction added";
  if (action === "text_copy") return "Text copied";
  if (action === "copy_blocked") return "Copy blocked";
  return String(action || "Unknown").replace(/_/g, " ");
}

export function formatActivityDetails(metadata, entityType, entityId) {
  if (!metadata || typeof metadata !== "object") {
    if (entityType === "lead" && entityId) return `Lead #${entityId}`;
    return "—";
  }
  const parts = [];
  if (metadata.leadName) parts.push(stripHtml(metadata.leadName));
  if (metadata.previousStatus && metadata.newStatus) {
    parts.push(`${metadata.previousStatus} → ${metadata.newStatus}`);
  }
  if (metadata.assignedUsername) {
    if (metadata.previousAssignedUsername) {
      parts.push(`reassigned from ${metadata.previousAssignedUsername} to ${metadata.assignedUsername}`);
    } else {
      parts.push(`assigned to ${metadata.assignedUsername}`);
    }
  } else if (metadata.assignedUserId != null) {
    if (metadata.previousAssignedUserId != null) {
      parts.push(`reassigned from user #${metadata.previousAssignedUserId} to user #${metadata.assignedUserId}`);
    } else {
      parts.push(`assigned to user #${metadata.assignedUserId}`);
    }
  }
  if (metadata.processorUsername) {
    if (metadata.previousProcessorUsername) {
      parts.push(
        `processor reassigned from ${metadata.previousProcessorUsername} to ${metadata.processorUsername}`,
      );
    } else {
      parts.push(`processor assigned to ${metadata.processorUsername}`);
    }
  } else if (metadata.processorUserId != null) {
    if (metadata.previousProcessorUserId != null) {
      parts.push(
        `processor reassigned from user #${metadata.previousProcessorUserId} to user #${metadata.processorUserId}`,
      );
    } else {
      parts.push(`processor assigned to user #${metadata.processorUserId}`);
    }
  } else if (metadata.previousProcessorUserId != null || metadata.previousProcessorUsername) {
    parts.push(
      metadata.previousProcessorUsername
        ? `processor cleared (was ${metadata.previousProcessorUsername})`
        : "processor cleared",
    );
  }
  if (metadata.summary) parts.push(stripHtml(metadata.summary));
  if (metadata.reason) parts.push(String(metadata.reason).replace(/_/g, " "));
  if (metadata.username) parts.push(`user: ${metadata.username}`);
  if (metadata.path) parts.push(metadata.path);
  if (metadata.source) parts.push(`source: ${String(metadata.source).replace(/_/g, " ")}`);
  if (metadata.text) parts.push(`“${metadata.text}”`);
  if (metadata.selectionLength != null) parts.push(`${metadata.selectionLength} chars`);
  if (metadata.field) parts.push(String(metadata.field));
  if (parts.length === 0 && entityType === "lead" && entityId) {
    parts.push(`Lead #${entityId}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function truncateActivityText(text, maxLength = 64) {
  if (!text || text === "—") return text;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

export function formatActivityLocation(row) {
  if (row?.location) return row.location;
  const parts = [row?.city, row?.region, row?.country].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return "—";
}

export function formatActivityLocationTitle(row) {
  const place = [row?.city, row?.region, row?.country].filter(Boolean).join(", ");
  const lat = row?.latitude != null ? Number(row.latitude) : null;
  const lng = row?.longitude != null ? Number(row.longitude) : null;
  const coords =
    Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : null;
  if (place && coords) return `${place} (${coords})`;
  if (place) return place;
  if (coords) return coords;
  return undefined;
}

const ACTIVITY_DB_FIELDS = [
  { key: "id", label: "ID" },
  { key: "userId", label: "User ID" },
  { key: "action", label: "Action" },
  { key: "entityType", label: "Entity type" },
  { key: "entityId", label: "Entity ID" },
  { key: "ipAddress", label: "IP address" },
  { key: "country", label: "Country" },
  { key: "region", label: "Region" },
  { key: "city", label: "City" },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
  { key: "userAgent", label: "User agent" },
  { key: "deviceType", label: "Device type" },
  { key: "sessionId", label: "Session ID" },
  { key: "createdAt", label: "Created at" },
  { key: "updatedAt", label: "Updated at" },
];

function formatActivityDbValue(key, value) {
  if (value == null || value === "") return "—";
  if (key === "latitude" || key === "longitude") {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(7) : "—";
  }
  if (key === "createdAt" || key === "updatedAt") {
    return formatReportWhenDual(value) || "—";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function ActivityChevron({ open }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-150 dark:text-zinc-500 ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function activityDetailFields(row) {
  const extra = Object.keys(row || {})
    .filter(
      (key) =>
        key !== "metadata" &&
        key !== "location" &&
        !ACTIVITY_DB_FIELDS.some((field) => field.key === key),
    )
    .map((key) => ({ key, label: key }));
  return [...ACTIVITY_DB_FIELDS, ...extra];
}

function ActivityDetailRow({ label, value, wide = false, mono = false }) {
  return (
    <div className={`grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-2 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="truncate pt-px text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd
        className={`min-w-0 break-all text-xs leading-snug text-zinc-800 dark:text-zinc-200 ${
          mono ? "whitespace-pre-wrap font-mono" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function ActivityRowDetail({ row }) {
  const fields = activityDetailFields(row);
  const metadataDisplay = formatActivityDbValue("metadata", row?.metadata);

  return (
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
      {fields.map(({ key, label }) => (
        <ActivityDetailRow
          key={key}
          label={label}
          value={formatActivityDbValue(key, row?.[key])}
          wide={key === "userAgent"}
          mono={key === "userAgent" || key === "sessionId" || key === "ipAddress" || key === "action"}
        />
      ))}
      <ActivityDetailRow label="Metadata" value={metadataDisplay} wide mono />
    </dl>
  );
}

export function RoleBadge({ value }) {
  const styles = {
    admin: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200",
    lead_supervisor: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-200",
    processor: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200",
    manager: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
    supervisor: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200",
    agent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
  };
  const palette =
    value === "admin" ||
    value === "lead_supervisor" ||
    value === "processor" ||
    value === "manager" ||
    value === "supervisor" ||
    value === "agent"
      ? styles[value]
      : "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200";
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${palette}`}>
      {roleLabel(value)}
    </span>
  );
}

export function MetricStat({ label, value }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/50">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">{value}</p>
    </div>
  );
}

export function UserCallLogCard({ call, isAdmin, showConferenceColumn, onDownload, downloadingId }) {
  const isLine2 = Number(call.dialerIndex) === 2;
  return (
    <article className="rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950/40">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-zinc-700 dark:text-zinc-200">
          <EtTimeWithTooltip value={call.createdAt} />
        </p>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              isLine2
                ? "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200"
                : "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200"
            }`}
          >
            {isLine2 ? "Line 2" : "Line 1"}
          </span>
          <span className="rounded-full bg-zinc-200/80 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            {call.status || "—"}
          </span>
        </div>
      </div>
      <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">{call.toNumber || "—"}</p>
      {showConferenceColumn ? (
        <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
          Invited:{" "}
          {Array.isArray(call.invitedToNames) && call.invitedToNames.length > 0
            ? call.invitedToNames.join(", ")
            : "—"}
        </p>
      ) : null}
      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-zinc-700 dark:text-zinc-200">
        {isAdmin ? (
          <>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Agent leg</dt>
              <dd className="tabular-nums">{formatDuration(call.agentDurationSeconds)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Customer leg</dt>
              <dd className="tabular-nums">{formatDuration(call.customerDurationSeconds)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total</dt>
              <dd className="font-semibold tabular-nums">{formatDuration(call.durationSeconds)}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Duration</dt>
            <dd className="font-semibold tabular-nums">{formatDuration(call.durationSeconds)}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Recording</dt>
          <dd className="mt-0.5">
            {call.recordingDownloadUrl ? (
              <button
                type="button"
                onClick={() => onDownload(call.id, call.recordingDownloadUrl)}
                disabled={downloadingId === call.id}
                className="rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
              >
                {downloadingId === call.id ? "Downloading…" : "Download"}
              </button>
            ) : (
              <span className="text-zinc-500">—</span>
            )}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export const detailFilterLabelClass =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

export const detailChipClass = "rounded-md border px-2.5 py-1 text-xs font-semibold";

export const callsDateInputClass =
  "h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-emerald-400/70 dark:focus:ring-emerald-400/20";

export const userSelectClass =
  "h-10 w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-emerald-400/70 dark:focus:ring-emerald-400/20";
