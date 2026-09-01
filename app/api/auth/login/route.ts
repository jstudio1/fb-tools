import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getLoginUrl } from "@/lib/facebook";

export const runtime = "nodejs";

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
