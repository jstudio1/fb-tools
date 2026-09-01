import { NextResponse } from "next/server";
import { loadPages, publicPages } from "@/lib/store";

export const runtime = "nodejs";
// This route reads mutable state from disk (data/pages.json) — without this,
// Next.js prerenders it as a static response at build time and would keep
// serving that same (empty) snapshot forever instead of the current file.
export const dynamic = "force-dynamic";

export async function GET() {
  const pages = loadPages();
  return NextResponse.json({ pages: publicPages(pages) });
}
