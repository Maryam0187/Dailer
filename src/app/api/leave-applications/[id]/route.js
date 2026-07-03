import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  deleteLeaveApplication,
  serializeLeaveApplication,
  updateLeaveApplicationReason,
} from "@/server/leave/userLeave";
import { logUserActivity } from "@/server/activity/logUserActivity";

export const runtime = "nodejs";

export async function PATCH(req, { params }) {
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

  const body = await req.json().catch(() => null);

  try {
    const application = await updateLeaveApplicationReason({
      applicationId,
      userId: authedUser.id,
      reason: body?.reason,
    });

    await logUserActivity({
      req,
      userId: authedUser.id,
      action: "leave_application_updated",
      entityType: "leave_application",
      entityId: application.id,
      metadata: { reasonOnly: true },
    });

    return NextResponse.json({
      ok: true,
      application: serializeLeaveApplication(application, authedUser.username),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to update leave application" }, { status: 400 });
  }
}

export async function DELETE(req, { params }) {
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
    const application = await deleteLeaveApplication({
      applicationId,
      userId: authedUser.id,
    });

    await logUserActivity({
      req,
      userId: authedUser.id,
      action: "leave_application_cancelled",
      entityType: "leave_application",
      entityId: application.id,
      metadata: {
        startDate: application.startDate,
        endDate: application.endDate,
        status: application.status,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to cancel leave application" }, { status: 400 });
  }
}
