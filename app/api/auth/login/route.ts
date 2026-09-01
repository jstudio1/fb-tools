import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getLoginUrl } from "@/lib/facebook";

export const runtime = "nodejs";
// Must generate a fresh random `state` per request — without this Next.js
// prerenders the route at build time and would reuse the same state/cookie
// for every visitor forever, defeating the CSRF check on /api/auth/callback.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = crypto.randomBytes(16).toString("hex");
    const url = getLoginUrl(state);
    const res = NextResponse.redirect(url);
    // Simple CSRF check for the callback (short-lived, dev-friendly cookie).
    res.cookies.set("fb_oauth_state", state, {
      httpOnly: true,
      maxAge: 300,
      sameSite: "lax",
      path: "/",
    });
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
