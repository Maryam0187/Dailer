import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { findCustomerDialChild, syncCustomerLegFromTwilio } from "@/server/calls/callLegs";
import {
  buildConferenceVoiceUrl,
  createConferenceName,
  getRequestBaseUrlFromRequest,
} from "@/server/calls/conferenceVoice";
import { getTwilioClient } from "@/server/twilio";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const callId = Number(params?.callId);
  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: "Invalid call id" }, { status: 400 });
  }

  const call = await db.CallLog.findOne({
    where: { id: callId },
    attributes: [
      "id",
      "userId",
      "twilioSid",
      "customerCallSid",
      "conferenceName",
      "direction",
      "status",
    ],
  });
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  if (call.userId !== authedUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (call.direction !== "outbound") {
    return NextResponse.json({ error: "Only outbound calls can be upgraded" }, { status: 400 });
  }

  const parentSid = String(call.twilioSid || "").trim();
  if (!parentSid) {
    return NextResponse.json(
      { error: "Call is not connected yet. Wait for your line to connect, then try again." },
      { status: 409 },
    );
  }

  const existingName = String(call.conferenceName || "").trim();
  if (existingName) {
    return NextResponse.json({
      ok: true,
      alreadyUpgraded: true,
      conferenceName: existingName,
      callMode: "conference",
    });
  }

  const fallbackBaseUrl = getRequestBaseUrlFromRequest(req);
  if (!fallbackBaseUrl) {
    return NextResponse.json(
      { error: "Could not determine public app URL for Twilio voice webhook" },
      { status: 500 },
    );
  }

  try {
    const client = getTwilioClient();
    let customerSid = String(call.customerCallSid || "").trim();
    if (!customerSid) {
      const synced = await syncCustomerLegFromTwilio(call);
      customerSid = String(synced?.customerCallSid || "").trim();
    }
    if (!customerSid) {
      const customerChild = await findCustomerDialChild(client, parentSid);
      customerSid = String(customerChild?.sid || "").trim();
      if (customerSid) {
        await call.update({ customerCallSid: customerSid });
      }
    }
    if (!customerSid) {
      return NextResponse.json(
        {
          error:
            "Customer is not on the line yet. Wait until they answer, then enable conference mode.",
        },
        { status: 409 },
      );
    }

    const conferenceName = createConferenceName({ userId: authedUser.id });
    const agentVoiceUrl = buildConferenceVoiceUrl(fallbackBaseUrl, conferenceName, "agent");
    const customerVoiceUrl = buildConferenceVoiceUrl(fallbackBaseUrl, conferenceName, "customer");

    await client.calls(parentSid).update({ url: agentVoiceUrl, method: "POST" });
    await client.calls(customerSid).update({ url: customerVoiceUrl, method: "POST" });

    await call.update({ conferenceName });

    return NextResponse.json({
      ok: true,
      alreadyUpgraded: false,
      conferenceName,
      callMode: "conference",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to upgrade call to conference" },
      { status: 502 },
    );
  }
}
