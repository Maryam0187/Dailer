import { NextResponse } from "next/server";
import {
  describeOneSignalAuth,
  getOneSignalAppId,
  getOneSignalSafariWebId,
} from "@/server/push/oneSignalEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/push/config
 * Public web config for the browser. Never returns the REST API key.
 */
export async function GET() {
  const appId = getOneSignalAppId();
  const safariWebId = getOneSignalSafariWebId();
  const auth = describeOneSignalAuth();

  return NextResponse.json({
    appId: appId || null,
    safariWebId: safariWebId || null,
    enabled: Boolean(appId),
    serverPushReady: auth.serverPushReady,
    hint: auth.hint,
  });
}
