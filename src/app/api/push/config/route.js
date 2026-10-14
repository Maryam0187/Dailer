import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public OneSignal web config for the browser.
 * App ID is not secret; REST API key is never returned.
 */
export async function GET() {
  const appId = String(
    process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "",
  ).trim();
  const safariWebId = String(
    process.env.ONESIGNAL_SAFARI_WEB_ID ||
      process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID ||
      "",
  ).trim();

  return NextResponse.json({
    enabled: Boolean(appId),
    appId: appId || null,
    safariWebId: safariWebId || null,
  });
}
