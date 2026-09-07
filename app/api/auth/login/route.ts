import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getLoginUrl } from "@/lib/facebook";
import { getRequestUser } from "@/lib/auth";

export const runtime = "nodejs";
// Must generate a fresh random `state` per request — without this Next.js
// prerenders the route at build time and would reuse the same state/cookie
// for every visitor forever, defeating the CSRF check on /api/auth/callback.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = getRequestUser(req);
    if (!user) return NextResponse.redirect(new URL("/login", req.url));
    const state = crypto.randomBytes(16).toString("hex");
    const url = getLoginUrl(state);
    const res = NextResponse.redirect(url);
    // Simple CSRF check for the callback (short-lived, dev-friendly cookie).
    res.cookies.set("fb_oauth_state", state, {
      httpOnly: true,
      maxAge: 300,
      sameSite: "lax",
      path: "/",
      secure: (process.env.APP_BASE_URL || "").startsWith("https://"),
    });
    res.cookies.set("fb_oauth_user", user.id, {
      httpOnly: true, maxAge: 300, sameSite: "lax", path: "/",
      secure: (process.env.APP_BASE_URL || "").startsWith("https://"),
    });
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
