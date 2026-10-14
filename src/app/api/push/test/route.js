import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { toOneSignalExternalId } from "@/lib/oneSignalExternalId";
import { sendPushToUser } from "@/server/push/oneSignal";
import {
  describeOneSignalAuth,
  getOneSignalAppId,
  getOneSignalRestApiKey,
} from "@/server/push/oneSignalEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/push/test — send a test push to the logged-in user + diagnostics.
 */
export async function POST() {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const externalId = toOneSignalExternalId(authedUser.id, authedUser.username);
  const appId = getOneSignalAppId();
  const apiKey = getOneSignalRestApiKey();
  const auth = describeOneSignalAuth();

  let onesignalUser = null;
  let onesignalUserError = null;
  if (appId && apiKey && externalId && auth.restApiKeyLooksValid) {
    try {
      const res = await fetch(
        `https://api.onesignal.com/apps/${encodeURIComponent(appId)}/users/by/external_id/${encodeURIComponent(externalId)}`,
        {
          headers: {
            Authorization: `Key ${apiKey}`,
            Accept: "application/json",
          },
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        onesignalUserError = { status: res.status, body: json };
      } else {
        onesignalUser = {
          onesignalId: json?.identity?.onesignal_id || null,
          externalId: json?.identity?.external_id || null,
          subscriptions: Array.isArray(json?.subscriptions)
            ? json.subscriptions.map((s) => ({
                id: s.id,
                type: s.type,
                enabled: s.enabled,
                token: s.token ? "present" : "missing",
              }))
            : [],
        };
      }
    } catch (err) {
      onesignalUserError = { message: err?.message || String(err) };
    }
  }

  const send = await sendPushToUser(authedUser.id, {
    title: "Dialer test",
    body: "If you see this, push is working.",
    username: authedUser.username,
    url: process.env.NEXT_PUBLIC_APP_URL
      ? `${String(process.env.NEXT_PUBLIC_APP_URL).replace(/\/$/, "").replace(/^["']|["']$/g, "")}/messages`
      : "/messages",
  });

  return NextResponse.json({
    dialerUserId: authedUser.id,
    username: authedUser.username,
    expectedExternalId: externalId,
    auth,
    onesignalUser,
    onesignalUserError,
    send,
  });
}
