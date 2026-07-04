import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  createLeaveApplication,
  listAllLeaveApplications,
  listLeaveApplicationsForUser,
  parseLeaveDateInput,
  serializeLeaveApplication,
} from "@/server/leave/userLeave";
import { logUserActivity } from "@/server/activity/logUserActivity";
import { buildLeaveApplicationAlert } from "@/server/leave/buildLeaveApplicationAlert";
import { sendWeb3Forms } from "@/lib/sendWeb3Forms";

export const runtime = "nodejs";

export async function GET() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows =
    authedUser.role === "admin"
      ? await listAllLeaveApplications()
      : await listLeaveApplicationsForUser(authedUser.id);

  return NextResponse.json({
    applications: rows.map((row) =>
      serializeLeaveApplication(row, authedUser.username, { forAdmin: authedUser.role === "admin" }),
    ),
  });
}

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (authedUser.sessionPurpose !== "leave_application" && authedUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const startDate = parseLeaveDateInput(body?.startDate);
  const endDate = parseLeaveDateInput(body?.endDate);
  const reason = body?.reason;

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "Start and end dates are required (YYYY-MM-DD)." }, { status: 400 });
  }

  try {
    const application = await createLeaveApplication({
      userId: authedUser.id,
      startDate,
      endDate,
      reason,
    });

    await logUserActivity({
      req,
      userId: authedUser.id,
      action: "leave_application_submitted",
      entityType: "leave_application",
      entityId: application.id,
      metadata: { startDate, endDate, status: "approved" },
    });

    const adminAlert = buildLeaveApplicationAlert({
      userId: authedUser.id,
      username: authedUser.username,
      startDate,
      endDate,
      reason,
      applicationId: application.id,
    });
    if (adminAlert?.subject && adminAlert?.message) {
      void sendWeb3Forms(adminAlert).catch((err) => {
        console.warn("[leave-applications] admin alert failed", err?.message || err);
      });
    }

    return NextResponse.json({
      ok: true,
      application: serializeLeaveApplication(application, authedUser.username),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to submit leave application" }, { status: 400 });
  }
}
