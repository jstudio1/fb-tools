import fs from "node:fs";
import path from "node:path";

export type StoredPage = {
  id: string;
  name: string;
  access_token: string;
  picture?: string;
};

export type HistoryEntry = {
  id: string;
  createdAt: string; // ISO timestamp of when the post was submitted
  imageMode: "same" | "random1" | "none";
  imageCount: number; // total images attached to this post batch
  scheduledFor: string | null; // ISO timestamp, or null if posted immediately
  results: {
    pageId: string;
    pageName: string;
    caption: string; // the exact caption posted to this page (captions can differ per page)
    imageLabel?: string; // filename of the single image used, when imageMode is "random1"
    ok: boolean;
    postId?: string;
    error?: string;
  }[];
};

export type PromptPreset = {
  id: string;
  name: string;
  prompt: string;
};

export type Settings = {
  prompts: PromptPreset[];
};

const DATA_DIR = path.join(process.cwd(), "data");

function userFile(userId: string, name: string) {
  if (!/^[a-f0-9-]{36}$/i.test(userId)) throw new Error("รหัสผู้ใช้ไม่ถูกต้อง");
  return path.join(DATA_DIR, "accounts", userId, name);
}

const DEFAULT_CAPTION_PROMPT = `คุณเป็นแอดมินเพจฟิตเนส เขียนแคปชั่นโพสต์ Facebook ภาษาไทย
โทนสนุก กระตุ้นให้คนอยากมาออกกำลังกาย ใช้อีโมจิพอประมาณ
ความยาว 2-4 บรรทัด ปิดท้ายด้วยคำชวนแอคชั่น (เช่น ทักแชท/แวะมาที่ยิม)

จัดรูปแบบให้อ่านง่ายและสวยงามเสมอ โดยเว้นบรรทัดว่างคั่นระหว่างแต่ละส่วน`;

const DEFAULT_PROMPTS: PromptPreset[] = [
  { id: "default", name: "Prompt หลัก", prompt: DEFAULT_CAPTION_PROMPT },
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson<T>(file: string, fallback: T): T {
  ensureDataDir();
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf-8");
  fs.renameSync(temporary, file);
}

/** Copy pre-login data to the owner account once, preserving existing installations. */
export function migrateLegacyData(userId: string) {
  const legacyFiles = ["pages.json", "history.json", "settings.json"];
  for (const name of legacyFiles) {
    const legacy = path.join(DATA_DIR, name);
    const target = userFile(userId, name);
    if (fs.existsSync(legacy) && !fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(legacy, target);
    }
  }
}

// ---- Pages ----

export function loadPages(userId: string): StoredPage[] {
  return readJson<StoredPage[]>(userFile(userId, "pages.json"), []);
}

export function savePages(userId: string, pages: StoredPage[]) {
  writeJson(userFile(userId, "pages.json"), pages);
}

/** Merge newly-fetched pages into storage (keeps pages from earlier syncs too). */
export function upsertPages(userId: string, newPages: StoredPage[]) {
  const existing = loadPages(userId);
  const byId = new Map(existing.map((p) => [p.id, p]));
  for (const p of newPages) byId.set(p.id, p);
  const merged = Array.from(byId.values());
  savePages(userId, merged);
  return merged;
}

/** Pages the client is allowed to see (never leak access tokens to the browser). */
export function publicPages(pages: StoredPage[]) {
  return pages.map(({ id, name, picture }) => ({ id, name, picture }));
}

// ---- History ----

export function loadHistory(userId: string): HistoryEntry[] {
  return readJson<HistoryEntry[]>(userFile(userId, "history.json"), []);
}

export function appendHistory(userId: string, entry: HistoryEntry) {
  const history = loadHistory(userId);
  history.unshift(entry); // newest first
  writeJson(userFile(userId, "history.json"), history.slice(0, 500)); // keep it bounded
}

// ---- Settings (named prompt presets) ----

export function loadSettings(userId: string): Settings {
  const raw = readJson<any>(userFile(userId, "settings.json"), null);
  if (!raw) return { prompts: DEFAULT_PROMPTS };

  if (Array.isArray(raw.prompts) && raw.prompts.length > 0) {
    return { prompts: raw.prompts };
  }

  // Migrate the old single-prompt shape ({ captionPrompt: string }) transparently.
  if (typeof raw.captionPrompt === "string" && raw.captionPrompt.trim()) {
    const migrated: Settings = {
      prompts: [{ id: "default", name: "Prompt หลัก", prompt: raw.captionPrompt }],
    };
    saveSettings(userId, migrated);
    return migrated;
  }

  return { prompts: DEFAULT_PROMPTS };
}

export function saveSettings(userId: string, settings: Settings) {
  writeJson(userFile(userId, "settings.json"), settings);
}
