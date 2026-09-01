const DEFAULT_MODEL = "claude-sonnet-5";

// Captions are separated by a line of 5+ "=" characters instead of JSON.
// JSON is fragile here — real captions contain quotes, emoji, and newlines
// that are easy for a model to mis-escape, and one bad escape breaks the
// whole batch. A plain-text delimiter degrades gracefully instead: even a
// truncated response still yields every complete caption before the cut.
const DELIMITER_RE = /\n{0,2}={5,}\n{0,2}/g;

function splitCaptions(text: string, expected: number): string[] {
  return text
    .split(DELIMITER_RE)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, expected);
}

/** Generates `count` distinct Facebook captions in one call. Returns as many as Claude produced (may be fewer than requested). */
export async function generateCaptions(
  systemPrompt: string,
  topic: string,
  count: number
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY — เพิ่มใน .env.local เพื่อใช้ฟีเจอร์เจนข้อความ"
    );
  }

  const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  const n = Math.max(1, Math.min(50, Math.floor(count) || 1));

  const topicLine = topic.trim() ? `หัวข้อ/รายละเอียดสำหรับโพสต์ชุดนี้: ${topic.trim()}` : "";
  const userMessage = [
    n === 1
      ? "ช่วยเขียนแคปชั่นโพสต์ Facebook ให้ 1 อัน"
      : `ช่วยเขียนแคปชั่นโพสต์ Facebook ให้ ${n} อัน โดยแต่ละอันต้องไม่ซ้ำกัน (คนละมุม/คนละประโยคเปิด) แต่ยังอยู่ในโทนเดียวกัน`,
    topicLine,
    n === 1
      ? "ตอบกลับด้วยเนื้อหาแคปชั่นล้วนๆ เท่านั้น ห้ามมีคำนำ คำอธิบาย หรือหมายเลขนำหน้า"
      : `ตอบกลับด้วยเนื้อหาแคปชั่นล้วนๆ เท่านั้น ห้ามมีคำนำ คำอธิบาย หรือหมายเลขนำหน้าแต่ละอัน\nคั่นระหว่างแคปชั่นแต่ละอันด้วยบรรทัดที่มีเครื่องหมาย ===== (เท่ากับ 5 ตัว) เท่านั้น ไม่ต้องใส่ ===== นำหน้าอันแรกหรือปิดท้ายอันสุดท้าย`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      // Leave generous headroom: this model sometimes spends tokens on internal
      // "thinking" before the visible answer, which counts against max_tokens too,
      // and the richer per-caption formatting (headline/body/links/tags) takes
      // more tokens than a one-liner would.
      max_tokens: Math.min(8000, 1800 + 700 * n),
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json?.error?.message || `Anthropic API error (${res.status})`);
  }

  const text = (json.content || [])
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    if (json.stop_reason === "max_tokens") {
      throw new Error("Claude ตอบไม่ทันเพราะ token หมดก่อน — ลองลดจำนวนชุดที่เจนแล้วลองใหม่");
    }
    throw new Error("ไม่ได้รับข้อความกลับมาจาก Claude");
  }

  const captions = splitCaptions(text, n);
  if (captions.length === 0) {
    throw new Error("ไม่ได้แคปชั่นที่ใช้ได้จาก Claude ลองเจนใหม่อีกครั้ง");
  }
  return captions;
}
