import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForUserToken, getLongLivedUserToken, getUserPages } from "@/lib/facebook";
import { upsertPages } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_BASE_URL || req.nextUrl.origin;
  const { searchParams } = req.nextUrl;

  const error = searchParams.get("error_description") || searchParams.get("error");
  if (error) {
    return NextResponse.redirect(`${baseUrl}/?error=${encodeURIComponent(error)}`);
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = req.cookies.get("fb_oauth_state")?.value;

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/?error=${encodeURIComponent("ไม่พบ code จาก Facebook")}`);
  }
  if (!state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(`${baseUrl}/?error=${encodeURIComponent("state ไม่ตรงกัน กรุณาลองใหม่")}`);
  }

  try {
    const shortToken = await exchangeCodeForUserToken(code);
    const longToken = await getLongLivedUserToken(shortToken);
    const pages = await getUserPages(longToken);
    upsertPages(pages);

    const res = NextResponse.redirect(`${baseUrl}/?connected=${pages.length}`);
    res.cookies.delete("fb_oauth_state");
    return res;
  } catch (err: any) {
    return NextResponse.redirect(`${baseUrl}/?error=${encodeURIComponent(err?.message || "เชื่อมต่อไม่สำเร็จ")}`);
  }
}
