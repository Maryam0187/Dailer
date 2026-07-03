import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { serializeLeaveApplication, updateLeaveApplicationStatus } from "@/server/leave/userLeave";
import { logUserActivity } from "@/server/activity/logUserActivity";

export const runtime = "nodejs";

export async function PATCH(req, { params }) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const applicationId = Number(rawId);
  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const status = String(body?.status || "").trim();

  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "Status must be approved or rejected." }, { status: 400 });
  }

  try {
    const application = await updateLeaveApplicationStatus({
      applicationId,
      status,
      reviewedBy: authedUser.id,
    });

    await logUserActivity({
      req,
      userId: authedUser.id,
      action: status === "approved" ? "leave_application_approved" : "leave_application_rejected",
      entityType: "leave_application",
      entityId: application.id,
      metadata: { targetUserId: application.userId, status },
    });

    return NextResponse.json({
      ok: true,
      application: serializeLeaveApplication(application),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to update leave status" }, { status: 400 });
  }
}
