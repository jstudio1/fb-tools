import { NextRequest, NextResponse } from "next/server";
import { generateCaptions } from "@/lib/anthropic";
import { getRequestUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = getRequestUser(req);
    if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
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
