import { NextRequest, NextResponse } from "next/server";
import { createUser, getRequestUser, listUsers, updateUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireOwner(req: NextRequest) {
  const user = getRequestUser(req);
  return user?.role === "owner" ? user : null;
}

export async function GET(req: NextRequest) {
  if (!requireOwner(req)) return NextResponse.json({ error: "สำหรับเจ้าของระบบเท่านั้น" }, { status: 403 });
  return NextResponse.json({ users: listUsers() });
}

export async function POST(req: NextRequest) {
  if (!requireOwner(req)) return NextResponse.json({ error: "สำหรับเจ้าของระบบเท่านั้น" }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ user: createUser({
      username: String(body.username || ""), displayName: String(body.displayName || ""), password: String(body.password || ""),
    }) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "สร้างบัญชีไม่สำเร็จ" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!requireOwner(req)) return NextResponse.json({ error: "สำหรับเจ้าของระบบเท่านั้น" }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ user: updateUser(String(body.id || ""), {
      active: typeof body.active === "boolean" ? body.active : undefined,
      password: body.password ? String(body.password) : undefined,
      displayName: body.displayName !== undefined ? String(body.displayName) : undefined,
    }) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "แก้ไขบัญชีไม่สำเร็จ" }, { status: 400 });
  }
}
