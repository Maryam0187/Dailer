import { NextResponse } from "next/server";
import { requireSalesBotTrainer } from "@/server/auth/requireSalesBotTrainer";
import { getOpenAiApiKey, synthesizeSpeech } from "@/server/calls/salesBot";

export const runtime = "nodejs";

export async function POST(req) {
  const { errorResponse } = await requireSalesBotTrainer();
  if (errorResponse) return errorResponse;

  if (!getOpenAiApiKey()) {
    return NextResponse.json(
      { error: "Sales bot is not configured (missing OPENAI_API_KEY)." },
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
    console.error("[sales-bot] speak failed:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to speak" },
      { status: 502 },
    );
  }
}
