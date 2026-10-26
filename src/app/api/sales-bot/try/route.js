import { NextResponse } from "next/server";
import { requireSalesBotTrainer } from "@/server/auth/requireSalesBotTrainer";
import {
  continueSalesBotTurn,
  getOpenAiApiKey,
  isAllowedTrainAudioType,
  MAX_TRAIN_AUDIO_BYTES,
  startSalesBotTurn,
  transcribeCustomerAudio,
} from "@/server/calls/salesBot";

export const runtime = "nodejs";

function missingKeyResponse() {
  return NextResponse.json(
    { error: "Sales bot is not configured (missing OPENAI_API_KEY)." },
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
    userText: String(src.userText || ""),
    state,
    audio: null,
  };
}

export async function POST(req) {
  const { errorResponse } = await requireSalesBotTrainer();
  if (errorResponse) return errorResponse;

  if (!getOpenAiApiKey()) return missingKeyResponse();

  const parsed = await readTryRequest(req);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const action = parsed.action;

  if (action === "start") {
    const started = await startSalesBotTurn();
    if (!started.ok) {
      return NextResponse.json(
        { error: started.error || "Failed to start" },
        { status: started.status || 500 },
      );
    }
    return NextResponse.json(started);
  }

  let userText = String(parsed.userText || "").trim();
  if (parsed.audio) {
    const mimeType = String(parsed.audio.type || "");
    if (!isAllowedTrainAudioType(mimeType)) {
      return NextResponse.json({ error: "Unsupported audio type" }, { status: 400 });
    }
    const buf = Buffer.from(await parsed.audio.arrayBuffer());
    if (buf.length > MAX_TRAIN_AUDIO_BYTES) {
      return NextResponse.json({ error: "Audio is too long" }, { status: 400 });
    }
    try {
      userText = await transcribeCustomerAudio({
        buffer: buf,
        mimeType,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err?.message || "Transcription failed" },
        { status: 502 },
      );
    }
  }

  const result = await continueSalesBotTurn({
    userText,
    state: parsed.state,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Failed" },
      { status: result.status || 400 },
    );
  }
  return NextResponse.json(result);
}
