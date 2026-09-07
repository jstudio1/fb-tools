import { NextRequest, NextResponse } from "next/server";
import { loadPages, publicPages } from "@/lib/store";
import { getRequestUser } from "@/lib/auth";

export const runtime = "nodejs";
// This route reads mutable state from disk (data/pages.json) — without this,
// Next.js prerenders it as a static response at build time and would keep
// serving that same (empty) snapshot forever instead of the current file.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = getRequestUser(req);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const pages = loadPages(user.id);
  return NextResponse.json({ pages: publicPages(pages) });
}
