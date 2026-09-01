import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { listChargeflowAlerts } from "@/server/chargeflow/client";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
/** Max Chargeflow pages to scan when applying a local date filter. */
const MAX_SCAN_PAGES = 30;

function clampInt(value, { min, max, fallback }) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseBoundary(value, endOfDay) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // YYYY-MM-DD from the UI date inputs
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
    const ms = d.getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

function chargeflowErrorMessage(err) {
  const data = err?.chargeflow;
  if (data?.error?.message) return String(data.error.message);
  if (data?.message) return String(data.message);
  return err?.message || "Failed to load Chargeflow alerts";
}

function inDateRange(alert, minMs, maxMs) {
  const t = Date.parse(alert?.created_at);
  if (Number.isNaN(t)) return false;
  if (minMs != null && t < minMs) return false;
  if (maxMs != null && t > maxMs) return false;
  return true;
}

/**
 * Chargeflow currently returns 400 for created_at_min/created_at_max (any ISO format).
 * When a date range is requested, pull typed pages from Chargeflow and filter locally.
 */
async function listAlertsWithOptionalDateFilter({
  offset,
  limit,
  type,
  status,
  reason,
  minMs,
  maxMs,
}) {
  const baseQuery = {};
  if (type) baseQuery.type = type;
  if (status) baseQuery.status = status;
  if (reason) baseQuery.reason = reason;

  const needsLocalDateFilter = minMs != null || maxMs != null;

  if (!needsLocalDateFilter) {
    const data = await listChargeflowAlerts({
      ...baseQuery,
      offset,
      limit,
    });
    return {
      alerts: Array.isArray(data?.alerts) ? data.alerts : [],
      pagination: data?.pagination || {
        totalCount: 0,
        offset,
        limit,
        totalPages: 1,
      },
    };
  }

  const matched = [];
  let pageIndex = 0;
  let totalPages = 1;

  while (pageIndex < Math.min(totalPages, MAX_SCAN_PAGES)) {
    const data = await listChargeflowAlerts({
      ...baseQuery,
      offset: pageIndex,
      limit: MAX_LIMIT,
    });
    const batch = Array.isArray(data?.alerts) ? data.alerts : [];
    const p = data?.pagination || {};
    totalPages = Math.max(1, Number(p.totalPages) || 1);

    for (const alert of batch) {
      if (inDateRange(alert, minMs, maxMs)) matched.push(alert);
    }

    if (batch.length === 0) break;
    pageIndex += 1;
    if (pageIndex >= totalPages) break;
  }

  const start = offset * limit;
  const page = matched.slice(start, start + limit);
  return {
    alerts: page,
    pagination: {
      totalCount: matched.length,
      offset,
      limit,
      totalPages: Math.max(1, Math.ceil(matched.length / limit) || 1),
    },
  };
}

export async function GET(request) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(request.url);
  const offset = clampInt(searchParams.get("offset"), { min: 0, max: 10_000, fallback: 0 });
  const limit = clampInt(searchParams.get("limit"), {
    min: 1,
    max: MAX_LIMIT,
    fallback: DEFAULT_LIMIT,
  });

  const type = searchParams.get("type") || "";
  const status = searchParams.get("status") || "";
  const reason = searchParams.get("reason") || "";

  // Prefer simple from/to (YYYY-MM-DD); also accept created_at_* for compatibility.
  const from = searchParams.get("from") || searchParams.get("created_at_min") || "";
  const to = searchParams.get("to") || searchParams.get("created_at_max") || "";
  const minMs = parseBoundary(from, false);
  const maxMs = parseBoundary(to, true);

  if ((from && minMs == null) || (to && maxMs == null)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  if (minMs != null && maxMs != null && minMs > maxMs) {
    return NextResponse.json({ error: "From date must be on or before To date" }, { status: 400 });
  }

  try {
    const data = await listAlertsWithOptionalDateFilter({
      offset,
      limit,
      type,
      status,
      reason,
      minMs,
      maxMs,
    });
    return NextResponse.json(data);
  } catch (err) {
    const statusCode = Number(err?.status) || 502;
    return NextResponse.json(
      { error: chargeflowErrorMessage(err) },
      { status: statusCode >= 400 && statusCode < 600 ? statusCode : 502 },
    );
  }
}
