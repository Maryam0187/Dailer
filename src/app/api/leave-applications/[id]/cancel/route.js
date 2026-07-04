import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { cancelLeaveApplication, serializeLeaveApplication } from "@/server/leave/userLeave";
import { logUserActivity } from "@/server/activity/logUserActivity";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const applicationId = Number(rawId);
  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  try {
    const application = await cancelLeaveApplication({
      applicationId,
      cancelledBy: authedUser.id,
    });

    await logUserActivity({
      req,
      userId: authedUser.id,
      action: "leave_application_cancelled",
      entityType: "leave_application",
      entityId: application.id,
      metadata: {
        targetUserId: application.userId,
        startDate: application.startDate,
        endDate: application.endDate,
        status: "cancelled",
      },
    });

    return NextResponse.json({
      ok: true,
      application: serializeLeaveApplication(application, null, { forAdmin: true }),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to cancel leave application" }, { status: 400 });
  }
}
