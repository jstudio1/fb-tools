import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, login, logout, publicUser, SESSION_COOKIE } from "@/lib/auth";
import { migrateLegacyData } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = getRequestUser(req);
  return user
    ? NextResponse.json({ user: publicUser(user) })
    : NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = login(String(body.username || ""), String(body.password || ""));
    if (!result) return NextResponse.json({ error: "Username หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
    if (result.user.role === "owner") migrateLegacyData(result.user.id);
    const response = NextResponse.json({ user: result.user });
    response.cookies.set(SESSION_COOKIE, result.token, {
      httpOnly: true, sameSite: "lax", secure: (process.env.APP_BASE_URL || "").startsWith("https://"),
      maxAge: result.maxAge, path: "/",
    });
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "เข้าสู่ระบบไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  logout(req.cookies.get(SESSION_COOKIE)?.value);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
