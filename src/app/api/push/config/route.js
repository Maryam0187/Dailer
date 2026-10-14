import { NextResponse } from "next/server";
import {
  describeOneSignalAuth,
  getOneSignalAppId,
  getOneSignalSafariWebId,
} from "@/server/push/oneSignalEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public OneSignal web config for the browser.
 * App ID is not secret; REST API key is never returned.
 */
export async function GET() {
  const appId = getOneSignalAppId();
  const safariWebId = getOneSignalSafariWebId();
  const auth = describeOneSignalAuth();

  return NextResponse.json({
    enabled: Boolean(appId),
    appId: appId || null,
    safariWebId: safariWebId || null,
    // Safe diagnostics for admins debugging Railway env (no secret values).
    serverPushReady: Boolean(auth.hasAppId && auth.hasRestApiKey && auth.restApiKeyLooksValid),
    restApiKeyConfigured: auth.hasRestApiKey,
    restApiKeyLooksValid: auth.restApiKeyLooksValid,
    hint: auth.hint,
  });
}
