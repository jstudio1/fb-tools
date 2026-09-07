import { NextRequest, NextResponse } from "next/server";
import { loadSettings, saveSettings, PromptPreset } from "@/lib/store";
import crypto from "node:crypto";
import { getRequestUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = getRequestUser(req);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  return NextResponse.json(loadSettings(user.id));
}

export async function POST(req: NextRequest) {
  const user = getRequestUser(req);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const prompts = body?.prompts;

  if (!Array.isArray(prompts) || prompts.length === 0) {
    return NextResponse.json({ error: "ต้องมีอย่างน้อย 1 Prompt" }, { status: 400 });
  }

  const cleaned: PromptPreset[] = [];
  for (const p of prompts) {
    const name = String(p?.name || "").trim();
    const prompt = String(p?.prompt || "").trim();
    if (!name || !prompt) {
      return NextResponse.json({ error: "กรุณาใส่ชื่อและเนื้อหาของทุก Prompt ให้ครบ" }, { status: 400 });
    }
    cleaned.push({
      id: String(p?.id || crypto.randomUUID()),
      name,
      prompt,
    });
  }

  saveSettings(user.id, { prompts: cleaned });
  return NextResponse.json({ ok: true, prompts: cleaned });
}
