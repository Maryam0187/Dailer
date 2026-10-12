import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { syncTwilioPhoneNumbers } from "@/server/twilio/syncTwilioPhoneNumbers";

export const runtime = "nodejs";

export async function POST(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => ({}));
  const scopeRaw = String(body?.scope || "all").trim().toLowerCase();
  const scope = scopeRaw === "main" || scopeRaw === "team" || scopeRaw === "all" ? scopeRaw : null;
  if (!scope) {
    return NextResponse.json(
      { error: 'scope must be "main", "team", or "all"' },
      { status: 400 },
    );
  }

  const managerId =
    body?.managerId != null && body.managerId !== "" ? Number(body.managerId) : null;

  if (scope === "team" && (!Number.isInteger(managerId) || managerId < 1)) {
    return NextResponse.json(
      { error: "managerId is required when scope is team" },
      { status: 400 },
    );
  }

  const result = await syncTwilioPhoneNumbers({ scope, managerId });

  if (result.error && (!result.accounts || result.accounts.length === 0)) {
    return NextResponse.json({ error: result.error, ...result }, { status: 400 });
  }

  // Partial success still 200 so UI can show per-account errors.
  return NextResponse.json(result);
}
