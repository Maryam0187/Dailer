import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  aggregateCallMetricsFromDaily,
  listCallMetricsByDay,
} from "@/server/calls/aggregateMetrics";

function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fromDate = parseDateOnly(searchParams.get("fromDate"));
  const toDate = parseDateOnly(searchParams.get("toDate"));
  const scope = String(searchParams.get("scope") || "all").trim().toLowerCase();
  const conferenceOnly = scope === "conference";

  if (!fromDate || !toDate) {
    return NextResponse.json({ error: "fromDate and toDate are required" }, { status: 400 });
  }
  if (fromDate > toDate) {
    return NextResponse.json({ error: "fromDate must be before or equal to toDate" }, { status: 400 });
  }

  const [metrics, byDay] = await Promise.all([
    aggregateCallMetricsFromDaily({
      userId: authedUser.id,
      fromDate,
      toDate,
      conferenceOnly,
    }),
    listCallMetricsByDay({
      userId: authedUser.id,
      fromDate,
      toDate,
      conferenceOnly,
    }),
  ]);

  return NextResponse.json({
    fromDate,
    toDate,
    scope: conferenceOnly ? "conference" : "all",
    metrics: {
      userId: authedUser.id,
      username: authedUser.username,
      ...metrics,
    },
    days: byDay.days,
    daysTruncated: byDay.daysTruncated,
  });
}
