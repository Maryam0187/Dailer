import { NextResponse } from "next/server";
import { requireAddressBotTrainer } from "@/server/auth/requireAddressBotTrainer";
import { getOpenAiApiKey, synthesizeSpeech } from "@/server/calls/addressBot";

export const runtime = "nodejs";

export async function POST(req) {
  const { errorResponse } = await requireAddressBotTrainer();
  if (errorResponse) return errorResponse;

  if (!getOpenAiApiKey()) {
    return NextResponse.json(
      { error: "Address bot is not configured (missing OPENAI_API_KEY)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const text = String(body?.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const audio = await synthesizeSpeech({ text });
    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[address-bot] speak failed:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to speak" },
      { status: 502 },
    );
  }
}
