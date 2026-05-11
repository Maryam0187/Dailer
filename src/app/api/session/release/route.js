import { NextResponse } from "next/server";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { releaseSession } from "@/server/userSession";

export const runtime = "nodejs";

/** Release the active Dialer session if this tab still owns it. Tolerant for sendBeacon callers. */
export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sessionId = "";
  try {
    const raw = await req.text();
    if (raw) {
      const body = JSON.parse(raw);
      sessionId = String(body?.sessionId || "").trim();
    }
  } catch {
    /* sendBeacon may send plain text or empty; treat as missing */
  }

  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing sessionId" }, { status: 400 });
  }

  await releaseSession(authedUser.id, sessionId);
  return NextResponse.json({ ok: true });
}
