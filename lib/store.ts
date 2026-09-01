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
const PAGES_FILE = path.join(DATA_DIR, "pages.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

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
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf-8");
}

// ---- Pages ----

export function loadPages(): StoredPage[] {
  return readJson<StoredPage[]>(PAGES_FILE, []);
}

export function savePages(pages: StoredPage[]) {
  writeJson(PAGES_FILE, pages);
}

/** Merge newly-fetched pages into storage (keeps pages from earlier syncs too). */
export function upsertPages(newPages: StoredPage[]) {
  const existing = loadPages();
  const byId = new Map(existing.map((p) => [p.id, p]));
  for (const p of newPages) byId.set(p.id, p);
  const merged = Array.from(byId.values());
  savePages(merged);
  return merged;
}

/** Pages the client is allowed to see (never leak access tokens to the browser). */
export function publicPages(pages: StoredPage[]) {
  return pages.map(({ id, name, picture }) => ({ id, name, picture }));
}

// ---- History ----

export function loadHistory(): HistoryEntry[] {
  return readJson<HistoryEntry[]>(HISTORY_FILE, []);
}

export function appendHistory(entry: HistoryEntry) {
  const history = loadHistory();
  history.unshift(entry); // newest first
  writeJson(HISTORY_FILE, history.slice(0, 500)); // keep it bounded
}

// ---- Settings (named prompt presets) ----

export function loadSettings(): Settings {
  const raw = readJson<any>(SETTINGS_FILE, null);
  if (!raw) return { prompts: DEFAULT_PROMPTS };

  if (Array.isArray(raw.prompts) && raw.prompts.length > 0) {
    return { prompts: raw.prompts };
  }

  // Migrate the old single-prompt shape ({ captionPrompt: string }) transparently.
  if (typeof raw.captionPrompt === "string" && raw.captionPrompt.trim()) {
    const migrated: Settings = {
      prompts: [{ id: "default", name: "Prompt หลัก", prompt: raw.captionPrompt }],
    };
    saveSettings(migrated);
    return migrated;
  }

  return { prompts: DEFAULT_PROMPTS };
}

export function saveSettings(settings: Settings) {
  writeJson(SETTINGS_FILE, settings);
}
