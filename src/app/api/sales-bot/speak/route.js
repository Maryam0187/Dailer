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
    const raw = String(err?.message || err || "Failed to speak");
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error?.message) message = parsed.error.message;
      else if (parsed?.message) message = parsed.message;
    } catch {
      /* plain text */
    }
    // Avoid dumping huge HTML/JSON bodies into the UI.
    message = message.replace(/\s+/g, " ").trim().slice(0, 300);
    console.error("[sales-bot] speak failed:", message);
    return NextResponse.json({ error: message || "Failed to speak" }, { status: 502 });
  }
}
