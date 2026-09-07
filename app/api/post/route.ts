import { NextRequest, NextResponse } from "next/server";
import { loadPages, appendHistory } from "@/lib/store";
import { postToPage } from "@/lib/facebook";
import crypto from "node:crypto";
import { getRequestUser } from "@/lib/auth";

export const runtime = "nodejs";

const MIN_SCHEDULE_MS = 10 * 60 * 1000; // Facebook requires at least 10 minutes ahead
const MAX_SCHEDULE_MS = 75 * 24 * 60 * 60 * 1000; // and at most 75 days ahead

type Pair = { pageId: string; caption: string; imageIndex?: number | null };

export async function POST(req: NextRequest) {
  const user = getRequestUser(req);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const form = await req.formData();

  const pairsRaw = String(form.get("pairs") || "[]");
  let pairs: Pair[] = [];
  try {
    pairs = JSON.parse(pairsRaw);
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  pairs = pairs.filter((p) => p && typeof p.pageId === "string");

  // imageMode: "same" = every page gets the full set of uploaded images;
  // "random1" = each page gets exactly one image, picked per-pair via imageIndex;
  // "none" = no images at all.
  const rawImageMode = String(form.get("imageMode") || "same");
  if (!["same", "random1", "none"].includes(rawImageMode)) {
    return NextResponse.json({ error: "รูปแบบการใช้รูปภาพไม่ถูกต้อง" }, { status: 400 });
  }
  const imageMode = rawImageMode as "same" | "random1" | "none";
  const images = form.getAll("images").filter((v): v is File => v instanceof File && v.size > 0);
  const scheduledForRaw = form.get("scheduledFor"); // ISO string from <input type=datetime-local>

  if (pairs.length === 0) {
    return NextResponse.json({ error: "กรุณาเลือกอย่างน้อย 1 เพจ" }, { status: 400 });
  }
  const hasAnyImage = imageMode !== "none" && images.length > 0;
  if (pairs.every((p) => !p.caption?.trim()) && !hasAnyImage) {
    return NextResponse.json({ error: "กรุณาใส่ข้อความหรือแนบรูปภาพ" }, { status: 400 });
  }

  let scheduledUnixTime: number | undefined;
  let scheduledForIso: string | null = null;
  if (scheduledForRaw && String(scheduledForRaw).trim()) {
    const scheduledDate = new Date(String(scheduledForRaw));
    if (Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "รูปแบบเวลาที่ตั้งไม่ถูกต้อง" }, { status: 400 });
    }
    const deltaMs = scheduledDate.getTime() - Date.now();
    if (deltaMs < MIN_SCHEDULE_MS) {
      return NextResponse.json(
        { error: "ต้องตั้งเวลาล่วงหน้าอย่างน้อย 10 นาที" },
        { status: 400 }
      );
    }
    if (deltaMs > MAX_SCHEDULE_MS) {
      return NextResponse.json(
        { error: "ตั้งเวลาล่วงหน้าได้ไม่เกิน 75 วัน" },
        { status: 400 }
      );
    }
    scheduledUnixTime = Math.floor(scheduledDate.getTime() / 1000);
    scheduledForIso = scheduledDate.toISOString();
  }

  const allPages = loadPages(user.id);
  const targets = pairs
    .map((p) => {
      const page = allPages.find((ap) => ap.id === p.pageId);
      if (!page) return null;

      let pageImages: { blob: Blob; filename: string }[] = [];
      if (imageMode === "same") {
        pageImages = images.map((img) => ({ blob: img as Blob, filename: img.name || "photo.jpg" }));
      } else if (imageMode === "random1") {
        const idx = typeof p.imageIndex === "number" ? p.imageIndex : -1;
        const img = images[idx];
        if (img) pageImages = [{ blob: img as Blob, filename: img.name || "photo.jpg" }];
      }

      return { page, caption: p.caption || "", images: pageImages };
    })
    .filter((t): t is { page: (typeof allPages)[number]; caption: string; images: { blob: Blob; filename: string }[] } =>
      Boolean(t)
    );

  if (targets.length === 0) {
    return NextResponse.json(
      { error: "ไม่พบเพจที่เลือกไว้ ลองเชื่อมต่อ Facebook ใหม่อีกครั้ง" },
      { status: 400 }
    );
  }

  const results = await Promise.all(
    targets.map(({ page, caption, images: pageImages }) =>
      postToPage(page, caption, pageImages, scheduledUnixTime ? { scheduledUnixTime } : undefined)
    )
  );

  appendHistory(user.id, {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    imageMode,
    imageCount: images.length,
    scheduledFor: scheduledForIso,
    results: results.map((r, i) => {
      const usedImage = targets[i].images[0];
      const base = {
        pageId: r.pageId,
        pageName: r.pageName,
        caption: targets[i].caption,
        imageLabel: imageMode === "random1" ? usedImage?.filename : undefined,
      };
      return r.ok
        ? { ...base, ok: true as const, postId: r.postId }
        : { ...base, ok: false as const, error: r.error };
    }),
  });

  return NextResponse.json({ results });
}
