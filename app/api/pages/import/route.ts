import { NextRequest, NextResponse } from "next/server";
import { getLongLivedUserToken, getUserPages } from "@/lib/facebook";
import { upsertPages } from "@/lib/store";
import { getRequestUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Fallback path for connecting pages without going through the OAuth redirect flow —
 * useful while an app's permissions/App Review setup is still being sorted out.
 * Accepts a User Access Token (e.g. pasted from Graph API Explorer, with your own app
 * selected there and pages_show_list + pages_manage_posts granted).
 */
export async function POST(req: NextRequest) {
  const user = getRequestUser(req);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token || "").trim();

  if (!token) {
    return NextResponse.json({ error: "กรุณาวาง Access Token" }, { status: 400 });
  }

  try {
    // Try to extend it to a long-lived token first; if that fails (e.g. the token
    // was generated with a different app), fall back to using it as-is.
    let userToken = token;
    try {
      userToken = await getLongLivedUserToken(token);
    } catch {
      // continue with the short-lived token
    }

    const pages = await getUserPages(userToken);
    if (pages.length === 0) {
      return NextResponse.json(
        { error: "ไม่พบเพจใดๆ — เช็คว่า token มีสิทธิ์ pages_show_list และ pages_manage_posts" },
        { status: 400 }
      );
    }
    upsertPages(user.id, pages);
    return NextResponse.json({ count: pages.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "นำเข้าไม่สำเร็จ" }, { status: 500 });
  }
}
