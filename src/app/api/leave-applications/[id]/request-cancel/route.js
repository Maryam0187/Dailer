import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { requestLeaveCancellation, serializeLeaveApplication } from "@/server/leave/userLeave";
import { buildLeaveCancellationRequestAlert } from "@/server/leave/buildLeaveCancellationRequestAlert";
import { sendWeb3Forms } from "@/lib/sendWeb3Forms";
import { logUserActivity } from "@/server/activity/logUserActivity";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (authedUser.sessionPurpose !== "leave_application" && authedUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const applicationId = Number(rawId);
  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  try {
    const application = await requestLeaveCancellation({
      applicationId,
      userId: authedUser.id,
    });

    await logUserActivity({
      req,
      userId: authedUser.id,
      action: "leave_application_cancel_requested",
      entityType: "leave_application",
      entityId: application.id,
      metadata: {
        startDate: application.startDate,
        endDate: application.endDate,
      },
    });

    const adminAlert = buildLeaveCancellationRequestAlert({
      userId: authedUser.id,
      username: authedUser.username,
      startDate: application.startDate,
      endDate: application.endDate,
      reason: application.reason,
      applicationId: application.id,
    });
    if (adminAlert?.subject && adminAlert?.message) {
      void sendWeb3Forms(adminAlert).catch((err) => {
        console.warn("[leave-applications] cancel request alert failed", err?.message || err);
      });
    }

    return NextResponse.json({
      ok: true,
      application: serializeLeaveApplication(application, authedUser.username),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to request cancellation" }, { status: 400 });
  }
}
