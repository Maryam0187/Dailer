import { NextResponse } from "next/server";
import { requireAddressBotTrainer } from "@/server/auth/requireAddressBotTrainer";
import {
  continueAddressBotTurn,
  getOpenAiApiKey,
  isAllowedTrainAudioType,
  MAX_TRAIN_AUDIO_BYTES,
  startAddressBotTurn,
  transcribeCustomerAudio,
} from "@/server/calls/addressBot";

export const runtime = "nodejs";

function missingKeyResponse() {
  return NextResponse.json(
    { error: "Address bot is not configured (missing OPENAI_API_KEY)." },
    { status: 503 },
  );
}

function parseStateField(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return undefined;
  }
}

async function readTryRequest(req) {
  const contentType = String(req.headers.get("content-type") || "");
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return { error: "Invalid form data", status: 400 };
    const uploaded = form.get("audio");
    let audio = null;
    if (uploaded && typeof uploaded !== "string") {
      audio = uploaded;
    }
    const state = parseStateField(form.get("state"));
    if (state === undefined) return { error: "state must be valid JSON", status: 400 };
    return {
      action: String(form.get("action") || "message").trim() || "message",
      addressId: Number(form.get("addressId")),
      userText: String(form.get("userText") || ""),
      state,
      audio,
    };
  }

  const body = await req.json().catch(() => null);
  const src = body && typeof body === "object" ? body : {};
  const state = parseStateField(src.state);
  if (state === undefined) return { error: "state must be valid JSON", status: 400 };
  return {
    action: String(src.action || "start").trim() || "start",
    addressId: Number(src.addressId),
    userText: String(src.userText || ""),
    state,
    audio: null,
  };
}

export async function POST(req) {
  const { errorResponse } = await requireAddressBotTrainer();
  if (errorResponse) return errorResponse;

  if (!getOpenAiApiKey()) return missingKeyResponse();

  const parsed = await readTryRequest(req);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const addressId = Number(parsed.addressId);
  if (!Number.isInteger(addressId) || addressId <= 0) {
    return NextResponse.json({ error: "addressId must be a positive integer" }, { status: 400 });
  }

  const action = parsed.action === "message" ? "message" : "start";

  try {
    if (action === "start") {
      const started = await startAddressBotTurn({ addressId });
      if (!started.ok) {
        return NextResponse.json(
          { error: started.error || "Address not found" },
          { status: started.status || 400 },
        );
      }
      return NextResponse.json({
        ok: true,
        reply: started.reply,
        customerText: "",
        botName: started.botName,
        addressLabel: started.addressLabel,
        state: started.state,
      });
    }

    let userText = String(parsed.userText || "").trim();
    if (parsed.audio) {
      if (parsed.audio.size > MAX_TRAIN_AUDIO_BYTES) {
        return NextResponse.json(
          { error: "Audio is too long. Try a shorter clip." },
          { status: 400 },
        );
      }
      const mimeType = String(parsed.audio.type || "audio/webm").split(";")[0].trim() || "audio/webm";
      if (!isAllowedTrainAudioType(mimeType)) {
        return NextResponse.json({ error: "Unsupported audio type" }, { status: 400 });
      }
      const buffer = Buffer.from(await parsed.audio.arrayBuffer());
      userText = await transcribeCustomerAudio({
        buffer,
        filename: parsed.audio.name,
        mimeType,
      });
      if (!userText) {
        return NextResponse.json(
          { error: "Could not hear that. Hold Talk and try again." },
          { status: 400 },
        );
      }
    }

    const result = await continueAddressBotTurn({
      userText,
      state: parsed.state,
      addressId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to continue" },
        { status: result.status || 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      reply: result.reply || "",
      customerText: result.customerText || userText,
      addressLabel: result.addressLabel || "",
      state: result.state,
    });
  } catch (err) {
    console.error("[address-bot] try failed:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to talk to the address bot" },
      { status: 502 },
    );
  }
}
