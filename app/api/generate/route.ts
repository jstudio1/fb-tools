import { NextRequest, NextResponse } from "next/server";
import { generateCaptions } from "@/lib/anthropic";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const promptText = String(body?.promptText || "").trim();
    const topic = String(body?.topic || "");
    const count = Number(body?.count) || 1;

    if (!promptText) {
      return NextResponse.json({ error: "กรุณาเลือก Prompt ก่อนเจนข้อความ" }, { status: 400 });
    }

    const captions = await generateCaptions(promptText, topic, count);
    return NextResponse.json({ captions });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "เจนข้อความไม่สำเร็จ" }, { status: 500 });
  }
}
