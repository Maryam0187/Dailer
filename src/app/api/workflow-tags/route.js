import { NextResponse } from "next/server";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { listWorkflowTags } from "@/server/workflowTags/registry";

export async function GET() {
  const { authedUser, errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

  const tags = await listWorkflowTags();
  return NextResponse.json({
    tags,
    isAdmin: authedUser.role === "admin",
  });
}
