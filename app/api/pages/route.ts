import { NextResponse } from "next/server";
import { loadPages, publicPages } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const pages = loadPages();
  return NextResponse.json({ pages: publicPages(pages) });
}
