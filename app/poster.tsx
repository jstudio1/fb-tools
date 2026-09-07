"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type FbPage = { id: string; name: string; picture?: string };
type PostResult =
  | { pageId: string; pageName: string; ok: true; postId: string }
  | { pageId: string; pageName: string; ok: false; error: string };
type HistoryEntry = {
  id: string;
  createdAt: string;
  imageMode: "same" | "random1" | "none";
  imageCount: number;
  scheduledFor: string | null;
  results: {
    pageId: string;
    pageName: string;
    caption: string;
    imageLabel?: string;
    ok: boolean;
    postId?: string;
    error?: string;
  }[];
};
type PromptPreset = { id: string; name: string; prompt: string };
type CaptionItem = { id: string; text: string; source?: string };
type ImageMode = "same" | "random1";
type CurrentUser = { id: string; username: string; displayName: string; role: "owner" | "user"; active: boolean; createdAt: string };
type ManagedUser = CurrentUser;

type Tab = "compose" | "history" | "settings" | "users";

// ---- Random assignment helpers ----
// Assigns one item per page by cycling through a shuffled copy of the pool,
// reshuffling whenever it runs out — so with 10 items and 5 pages you get 5
// random, non-repeating picks; with 5 items and 10 pages every item gets used
// roughly twice, still in random order.
function shuffleIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function assignIndices(poolLength: number, count: number): number[] {
  if (poolLength === 0) return Array(count).fill(-1);
  const result: number[] = [];
  let queue: number[] = [];
  while (result.length < count) {
    if (queue.length === 0) queue = shuffleIndices(poolLength);
    result.push(queue.pop()!);
  }
  return result;
}

// Defensive cleanup: if a caption ever contains a literal backslash-n (two
// characters) instead of a real line break, turn it into one so it renders
// as an actual new line instead of raw "\n" text.
function normalizeCaption(text: string): string {
  return text.replace(/\\n/g, "\n");
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function Poster({ user }: { user: CurrentUser }) {
  const searchParams = useSearchParams();
  const connectedCount = searchParams.get("connected");
  const oauthError = searchParams.get("error");

  const [tab, setTab] = useState<Tab>("compose");
  const [pages, setPages] = useState<FbPage[]>([]);
  const [prompts, setPrompts] = useState<PromptPreset[]>([]);

  useEffect(() => {
    fetch("/api/pages")
      .then((r) => r.json())
      .then((data) => setPages(data.pages || []))
      .catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setPrompts(data.prompts || []))
      .catch(() => {});
  }, []);

  return (
    <main>
      <div className="app-heading">
        <div><h1>📣 Facebook Multi-Page Poster</h1><p className="subtitle">โพสต์รูปภาพ + ข้อความ ไปหลายเพจพร้อมกันในคลิกเดียว</p></div>
        <div className="account-box"><span><strong>{user.displayName}</strong><small>@{user.username}{user.role === "owner" ? " · เจ้าของระบบ" : ""}</small></span><button className="btn btn-secondary" onClick={async () => { await fetch("/api/auth/session", { method: "DELETE" }); location.href = "/login"; }}>ออกจากระบบ</button></div>
      </div>

      {connectedCount && (
        <div className="banner ok">เชื่อมต่อสำเร็จ พบ {connectedCount} เพจที่คุณเป็นแอดมิน</div>
      )}
      {oauthError && <div className="banner err">เชื่อมต่อไม่สำเร็จ: {oauthError}</div>}

      <div className="top-bar">
        <div className="tabs">
          <button className={`tab ${tab === "compose" ? "active" : ""}`} onClick={() => setTab("compose")}>
            โพสต์ใหม่
          </button>
          <button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
            ประวัติการโพสต์
          </button>
          <button className={`tab ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>
            ตั้งค่า Prompt
          </button>
          {user.role === "owner" && <button className={`tab ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>ผู้ใช้งาน</button>}
        </div>
        <a className="btn btn-secondary" href="/api/auth/login">
          เชื่อมต่อ / ซิงก์เพจ Facebook
        </a>
      </div>

      {tab === "compose" && (
        <>
          <TokenImport onImported={(pgs) => setPages(pgs)} />
          <ComposeTab pages={pages} prompts={prompts} />
        </>
      )}
      {tab === "history" && <HistoryTab />}
      {tab === "settings" && <SettingsTab prompts={prompts} onSaved={setPrompts} />}
      {tab === "users" && user.role === "owner" && <UsersTab currentUserId={user.id} />}
    </main>
  );
}

// ---- Small building blocks ----

function AutoTextarea({
  value,
  onChange,
  placeholder,
  minHeight = 90,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(minHeight, el.scrollHeight) + "px";
  }, [value, minHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ minHeight, overflow: "hidden", ...style }}
    />
  );
}

function Modal({
  open,
  title,
  subtitle,
  onCancel,
  onConfirm,
  confirmLabel,
  confirming,
  confirmingLabel = "กำลังทำงาน…",
  confirmDisabled,
  confirmTone = "confirm",
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirming: boolean;
  confirmingLabel?: string;
  confirmDisabled?: boolean;
  confirmTone?: "confirm" | "danger";
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={confirming}>
            ยกเลิก
          </button>
          <button
            className={`btn ${confirmTone === "danger" ? "btn-danger" : "btn-confirm"}`}
            onClick={onConfirm}
            disabled={confirming || confirmDisabled}
          >
            {confirming ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TokenImport({ onImported }: { onImported: (pages: FbPage[]) => void }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleImport() {
    if (!token.trim()) {
      setMessage({ type: "err", text: "กรุณาวาง Access Token" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/pages/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: data?.error || "นำเข้าไม่สำเร็จ" });
      } else {
        setMessage({ type: "ok", text: `นำเข้าสำเร็จ พบ ${data.count} เพจ` });
        setToken("");
        const r = await fetch("/api/pages");
        const d = await r.json();
        onImported(d.pages || []);
      }
    } catch {
      setMessage({ type: "err", text: "นำเข้าไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <button className="link-btn" onClick={() => setOpen((v) => !v)}>
        {open ? "▾" : "▸"} ปุ่ม "เชื่อมต่อ" ด้านบนใช้ไม่ได้? วาง Access Token เอง
      </button>
      {open && (
        <div style={{ marginTop: 14 }}>
          <p className="card-subtext" style={{ marginBottom: 12 }}>
            ไปที่{" "}
            <a
              style={{ color: "var(--accent)" }}
              href="https://developers.facebook.com/tools/explorer/"
              target="_blank"
              rel="noreferrer"
            >
              Graph API Explorer
            </a>{" "}
            → เลือกแอปของคุณเองที่มุมขวาบน (Meta App) → กด "Generate Access Token" → ติ๊กสิทธิ์{" "}
            <code>pages_show_list</code> และ <code>pages_manage_posts</code> → คัดลอก token ที่ได้มาวางตรงนี้
          </p>
          <div className="row">
            <input
              type="text"
              placeholder="วาง Access Token ที่นี่"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
            <button className="btn btn-secondary" onClick={handleImport} disabled={busy}>
              {busy ? "กำลังนำเข้า…" : "นำเข้าเพจ"}
            </button>
          </div>
          {message && (
            <div className={`banner ${message.type}`} style={{ marginTop: 12, marginBottom: 0 }}>
              {message.text}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---- Generate modal: pick which prompt(s) + how many captions per prompt ----

function GenerateModal({
  open,
  prompts,
  generating,
  onCancel,
  onGenerate,
}: {
  open: boolean;
  prompts: PromptPreset[];
  generating: boolean;
  onCancel: () => void;
  onGenerate: (topic: string, selections: { promptId: string; count: number }[]) => void;
}) {
  const [topic, setTopic] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open && prompts.length > 0 && Object.keys(counts).length === 0) {
      setCounts({ [prompts[0].id]: 5 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prompts]);

  function toggle(id: string) {
    setCounts((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = 5;
      return next;
    });
  }

  function setCount(id: string, n: number) {
    setCounts((prev) => ({ ...prev, [id]: Math.max(1, Math.min(50, n)) }));
  }

  const selections = Object.entries(counts).map(([promptId, count]) => ({ promptId, count }));
  const totalCount = selections.reduce((a, b) => a + b.count, 0);

  return (
    <Modal
      open={open}
      title="🪄 เจนข้อความ"
      subtitle="เลือก Prompt (เลือกได้หลายอัน) และจำนวนชุดที่ต้องการต่อ Prompt"
      onCancel={onCancel}
      onConfirm={() => onGenerate(topic, selections)}
      confirmLabel={`เจนข้อความ (${totalCount} ชุด)`}
      confirming={generating}
      confirmingLabel="กำลังเจน…"
      confirmDisabled={selections.length === 0}
    >
      <input
        type="text"
        placeholder="หัวข้อวันนี้ (ไม่ใส่ก็ได้) เช่น โปรโมชั่นคลาสเช้า"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        style={{ width: "100%", marginBottom: 14 }}
      />

      {prompts.length === 0 ? (
        <p className="card-subtext">
          ยังไม่มี Prompt — ไปสร้างที่แท็บ "ตั้งค่า Prompt" ก่อนครับ
        </p>
      ) : (
        <div className="prompt-pick-list">
          {prompts.map((p) => (
            <div className="prompt-pick-row" key={p.id}>
              <label>
                <input type="checkbox" checked={Boolean(counts[p.id])} onChange={() => toggle(p.id)} />
                {p.name}
              </label>
              {counts[p.id] ? (
                <input
                  type="text"
                  inputMode="numeric"
                  className="count-input"
                  value={counts[p.id]}
                  onChange={(e) => setCount(p.id, Number(e.target.value.replace(/\D/g, "")) || 1)}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function FacebookPreview({ page, caption, imageUrls }: { page: FbPage; caption: string; imageUrls: string[] }) {
  const visible = imageUrls.slice(0, 5);
  return (
    <article className="fb-preview">
      <div className="fb-preview-head">
        {page.picture ? <img src={page.picture} alt="" /> : <div className="fb-avatar-fallback">{page.name.slice(0, 1)}</div>}
        <div><strong>{page.name}</strong><div>เมื่อสักครู่ · <span aria-label="สาธารณะ">🌐</span></div></div>
        <span className="fb-menu">•••</span>
      </div>
      {caption && <div className="fb-caption">{caption}</div>}
      {visible.length > 0 && (
        <div className={`fb-photo-grid photos-${visible.length}`}>
          {visible.map((url, index) => (
            <div className="fb-photo" key={url}>
              <img src={url} alt={`รูปที่ ${index + 1}`} />
              {index === 4 && imageUrls.length > 5 && <span className="fb-more">+{imageUrls.length - 5}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="fb-reactions"><span>👍 ❤️</span><span>0 ความคิดเห็น</span></div>
      <div className="fb-actions"><span>👍 ถูกใจ</span><span>💬 แสดงความคิดเห็น</span><span>↗ แชร์</span></div>
    </article>
  );
}

function ComposeTab({ pages, prompts }: { pages: FbPage[]; prompts: PromptPreset[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [pool, setPool] = useState<CaptionItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [captionOverrides, setCaptionOverrides] = useState<Record<string, string>>({}); // pageId -> caption item id
  const [imageOverrides, setImageOverrides] = useState<Record<string, number>>({}); // pageId -> image index

  const [imageMode, setImageMode] = useState<ImageMode>("same");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [posting, setPosting] = useState(false);
  const [results, setResults] = useState<PostResult[] | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewPageId, setPreviewPageId] = useState("");

  const allSelected = pages.length > 0 && selected.size === pages.length;
  const selectedPages = useMemo(() => pages.filter((p) => selected.has(p.id)), [pages, selected]);
  const nonEmptyPool = useMemo(() => pool.filter((c) => c.text.trim().length > 0), [pool]);
  const imageUrls = useMemo(() => imageFiles.map((file) => URL.createObjectURL(file)), [imageFiles]);
  useEffect(() => () => imageUrls.forEach((url) => URL.revokeObjectURL(url)), [imageUrls]);

  // Reset manual overrides whenever the underlying pools change shape, so stale
  // picks (pointing at a caption/image that no longer exists) can't linger.
  useEffect(() => setCaptionOverrides({}), [nonEmptyPool.length]);
  useEffect(() => setImageOverrides({}), [imageFiles.length, imageMode]);

  const captionAssignment = useMemo(
    () => assignIndices(nonEmptyPool.length, selectedPages.length),
    [nonEmptyPool.length, selectedPages.length, shuffleSeed]
  );
  const imageAssignment = useMemo(
    () => assignIndices(imageFiles.length, selectedPages.length),
    [imageFiles.length, selectedPages.length, shuffleSeed]
  );

  const pairs = useMemo(
    () =>
      selectedPages.map((page, i) => {
        let caption = "";
        if (nonEmptyPool.length > 0) {
          const overrideId = captionOverrides[page.id];
          const overrideItem = overrideId ? nonEmptyPool.find((c) => c.id === overrideId) : undefined;
          caption = overrideItem ? overrideItem.text : nonEmptyPool[captionAssignment[i]].text;
        }
        let imageIndex: number | null = null;
        let imageLabel: string | undefined;
        if (imageMode === "random1" && imageFiles.length > 0) {
          const ov = imageOverrides[page.id];
          imageIndex = typeof ov === "number" ? ov : imageAssignment[i];
          imageLabel = imageFiles[imageIndex]?.name;
        }
        return { page, caption, imageIndex, imageLabel };
      }),
    [selectedPages, nonEmptyPool, captionAssignment, captionOverrides, imageMode, imageFiles, imageAssignment, imageOverrides]
  );

  const showMatchTable =
    selectedPages.length > 0 && (nonEmptyPool.length > 1 || (imageMode === "random1" && imageFiles.length > 1));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(pages.map((p) => p.id)));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setImageFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  }

  function removeImage(idx: number) {
    setImageFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveImage(from: number, direction: -1 | 1) {
    setImageFiles((prev) => {
      const to = from + direction;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  function updateCaption(idx: number, value: string) {
    setPool((prev) => prev.map((c, i) => (i === idx ? { ...c, text: value } : c)));
  }

  function removeCaption(idx: number) {
    setPool((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleGenerateConfirm(topic: string, selections: { promptId: string; count: number }[]) {
    if (selections.length === 0) return;
    setGenerating(true);
    setMessage(null);
    try {
      const outcomes = await Promise.all(
        selections.map(async (sel) => {
          const preset = prompts.find((p) => p.id === sel.promptId);
          if (!preset) return { ok: false as const, name: "ไม่ทราบชื่อ", error: "ไม่พบ Prompt นี้แล้ว" };
          try {
            const res = await fetch("/api/generate", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ promptText: preset.prompt, topic, count: sel.count }),
            });
            const data = await res.json();
            if (!res.ok) return { ok: false as const, name: preset.name, error: data?.error || "เจนไม่สำเร็จ" };
            return { ok: true as const, name: preset.name, captions: (data.captions || []) as string[] };
          } catch {
            return { ok: false as const, name: preset.name, error: "เจนไม่สำเร็จ" };
          }
        })
      );

      const newItems: CaptionItem[] = [];
      const failed: string[] = [];
      for (const o of outcomes) {
        if (o.ok) {
          for (const c of o.captions) newItems.push({ id: newId(), text: normalizeCaption(c), source: o.name });
        } else {
          failed.push(`${o.name} (${o.error})`);
        }
      }
      setPool((prev) => [...prev, ...newItems]);
      if (newItems.length > 0) setGenerateModalOpen(false);
      if (failed.length > 0) {
        setMessage({ type: "err", text: `บาง Prompt เจนไม่สำเร็จ: ${failed.join(", ")}` });
      } else {
        setMessage({ type: "ok", text: `เจนสำเร็จ ${newItems.length} ชุด` });
      }
    } finally {
      setGenerating(false);
    }
  }

  function openConfirm() {
    setMessage(null);
    if (selectedPages.length === 0) {
      setMessage({ type: "err", text: "กรุณาเลือกอย่างน้อย 1 เพจ" });
      return;
    }
    const hasImages = imageMode === "same" ? imageFiles.length > 0 : pairs.some((p) => p.imageIndex !== null);
    if (nonEmptyPool.length === 0 && !hasImages) {
      setMessage({ type: "err", text: "กรุณาเพิ่มข้อความอย่างน้อย 1 ชุด หรือแนบรูปภาพ" });
      return;
    }
    if (scheduleEnabled && !scheduledFor) {
      setMessage({ type: "err", text: "กรุณาเลือกวันเวลาที่จะโพสต์" });
      return;
    }
    setPreviewPageId(selectedPages[0]?.id || "");
    setConfirmOpen(true);
  }

  async function confirmPost() {
    setPosting(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append(
        "pairs",
        JSON.stringify(pairs.map((p) => ({ pageId: p.page.id, caption: p.caption, imageIndex: p.imageIndex })))
      );
      form.append("imageMode", imageFiles.length > 0 ? imageMode : "none");
      imageFiles.forEach((f) => form.append("images", f));
      if (scheduleEnabled && scheduledFor) form.append("scheduledFor", scheduledFor);

      const res = await fetch("/api/post", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: data?.error || "โพสต์ไม่สำเร็จ" });
      } else {
        setResults(data.results || []);
        setConfirmOpen(false);
        setMessage(
          scheduleEnabled
            ? { type: "ok", text: "ตั้งเวลาโพสต์เรียบร้อย Facebook จะโพสต์ให้อัตโนมัติตามเวลาที่กำหนด" }
            : { type: "ok", text: "โพสต์เรียบร้อยแล้ว" }
        );
      }
    } catch {
      setMessage({ type: "err", text: "เกิดข้อผิดพลาดระหว่างโพสต์" });
    } finally {
      setPosting(false);
    }
  }

  const successCount = useMemo(() => (results || []).filter((r) => r.ok).length, [results]);

  // Minimum allowed value for the datetime-local input: 10 minutes from now.
  const minScheduleValue = useMemo(() => {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  const scheduledLabel = scheduledFor
    ? new Date(scheduledFor).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
    : "";

  return (
    <>
      {message && <div className={`banner ${message.type}`}>{message.text}</div>}

      <section className="card">
        <div className="row">
          <p className="card-title">🏷️ เพจของคุณ ({pages.length})</p>
        </div>

        {pages.length === 0 ? (
          <p className="card-subtext">
            ยังไม่มีเพจ — กด "เชื่อมต่อ / ซิงก์เพจ Facebook" ด้านบน แล้วล็อกอินด้วยบัญชีที่เป็นแอดมินของเพจทั้งหมด
          </p>
        ) : (
          <>
            <div className="row">
              <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                เลือกทั้งหมด
              </label>
              <span className="muted">
                เลือกแล้ว {selected.size} / {pages.length}
              </span>
            </div>
            <div className="page-list">
              {pages.map((p) => (
                <label className={`page-row ${selected.has(p.id) ? "selected" : ""}`} key={p.id}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  {p.picture ? <img src={p.picture} alt="" /> : <div className="page-row-avatar" />}
                  <span className="page-row-name">{p.name}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="row">
          <p className="card-title">📝 คลังข้อความ ({nonEmptyPool.length})</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setPool((prev) => [...prev, { id: newId(), text: "" }])}>
              + เพิ่มข้อความเอง
            </button>
            <button className="btn" onClick={() => setGenerateModalOpen(true)}>
              🪄 เจนข้อความ
            </button>
          </div>
        </div>
        {pool.length === 0 ? (
          <p className="card-subtext">ยังไม่มีข้อความ — กด "เจนข้อความ" ให้ AI ช่วย หรือ "+ เพิ่มข้อความเอง" เพื่อพิมพ์เอง</p>
        ) : (
          <div>
            {pool.map((c, i) => (
              <div key={c.id} className="caption-item">
                <span className="caption-index">{i + 1}</span>
                <div style={{ flex: 1 }}>
                  {c.source && <span className="source-badge">{c.source}</span>}
                  <AutoTextarea value={c.text} onChange={(v) => updateCaption(i, v)} placeholder="พิมพ์ข้อความ…" minHeight={48} />
                </div>
                <button className="btn-icon" onClick={() => removeCaption(i)} title="ลบข้อความนี้">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <p className="card-title">🖼️ รูปภาพ</p>
        <div className="section-gap" />
        <div className="mode-picker">
          <label className={`mode-option ${imageMode === "same" ? "active" : ""}`}>
            <input type="radio" name="imgmode" checked={imageMode === "same"} onChange={() => setImageMode("same")} />
            <div>
              <div className="mode-option-title">แนบรูปชุดเดียวกันทุกเพจ</div>
              <div className="mode-option-desc">ทุกเพจได้รูปครบทุกใบที่แนบ (ถ้าแนบหลายรูป = โพสต์เป็นอัลบั้ม)</div>
            </div>
          </label>
          <label className={`mode-option ${imageMode === "random1" ? "active" : ""}`}>
            <input type="radio" name="imgmode" checked={imageMode === "random1"} onChange={() => setImageMode("random1")} />
            <div>
              <div className="mode-option-title">สุ่มแจกเพจละ 1 ภาพ</div>
              <div className="mode-option-desc">แนบหลายรูป ระบบสุ่มแจกให้แต่ละเพจได้คนละ 1 ภาพไม่ซ้ำ</div>
            </div>
          </label>
        </div>
        <input type="file" accept="image/*" multiple onChange={onFilesChange} />
        {imageFiles.length > 0 && (
          <div className="thumb-grid">
            {imageFiles.map((f, i) => (
              <div className="thumb" key={`${f.name}-${f.lastModified}-${i}`}>
                <img src={imageUrls[i]} alt="" />
                {imageMode === "random1" && <span className="index-badge">#{i + 1}</span>}
                <button onClick={() => removeImage(i)} title="ลบรูปนี้">
                  ✕
                </button>
                <div className="thumb-order">
                  <button onClick={() => moveImage(i, -1)} disabled={i === 0} title="เลื่อนไปซ้าย">‹</button>
                  <span>{i + 1}</span>
                  <button onClick={() => moveImage(i, 1)} disabled={i === imageFiles.length - 1} title="เลื่อนไปขวา">›</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {imageFiles.length > 1 && <p className="card-subtext">ใช้ปุ่ม ‹ › บนรูปเพื่อจัดลำดับ ลำดับนี้จะใช้ทั้งในพรีวิวและตอนโพสต์จริง</p>}
      </section>

      {showMatchTable && (
        <section className="card">
          <div className="row">
            <p className="card-title">🎯 จับคู่ข้อความ/รูปกับเพจ (ไม่บังคับ)</p>
            <button className="btn btn-secondary" onClick={() => setShuffleSeed((s) => s + 1)}>
              🔀 สุ่มใหม่
            </button>
          </div>
          <p className="card-subtext" style={{ marginBottom: 12 }}>
            ค่าเริ่มต้นคือสุ่มจับคู่ให้อัตโนมัติแบบไม่ซ้ำ — ถ้าอยากกำหนดเองว่าเพจไหนได้ข้อความ/รูปไหน เลือกจาก
            dropdown ได้เลย ถ้าไม่เลือกก็ปล่อยให้ระบบสุ่มให้ตามปกติ
          </p>
          <div>
            {selectedPages.map((page, i) => (
              <div className="match-row" key={page.id}>
                <span className="match-page">{page.name}</span>
                {nonEmptyPool.length > 1 && (
                  <select
                    value={captionOverrides[page.id] || ""}
                    onChange={(e) =>
                      setCaptionOverrides((prev) => {
                        const next = { ...prev };
                        if (e.target.value) next[page.id] = e.target.value;
                        else delete next[page.id];
                        return next;
                      })
                    }
                  >
                    <option value="">
                      🔀 สุ่มอัตโนมัติ (#{captionAssignment[i] + 1})
                    </option>
                    {nonEmptyPool.map((c, ci) => (
                      <option key={c.id} value={c.id}>
                        #{ci + 1}: {c.text.slice(0, 40)}
                        {c.text.length > 40 ? "…" : ""}
                      </option>
                    ))}
                  </select>
                )}
                {imageMode === "random1" && imageFiles.length > 1 && (
                  <select
                    value={imageOverrides[page.id] ?? ""}
                    onChange={(e) =>
                      setImageOverrides((prev) => {
                        const next = { ...prev };
                        if (e.target.value !== "") next[page.id] = Number(e.target.value);
                        else delete next[page.id];
                        return next;
                      })
                    }
                  >
                    <option value="">🔀 สุ่มอัตโนมัติ (#{imageAssignment[i] + 1})</option>
                    {imageFiles.map((f, fi) => (
                      <option key={fi} value={fi}>
                        รูป #{fi + 1}: {f.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: scheduleEnabled ? 12 : 0, cursor: "pointer" }}>
          <input type="checkbox" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} />
          <span className="card-title" style={{ margin: 0 }}>
            ⏰ ตั้งเวลาโพสต์ล่วงหน้า
          </span>
        </label>
        {scheduleEnabled && (
          <>
            <input
              type="datetime-local"
              value={scheduledFor}
              min={minScheduleValue}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
            <p className="card-subtext">ตั้งล่วงหน้าได้ 10 นาที ถึง 75 วัน — Facebook จะโพสต์ให้อัตโนมัติตามเวลานี้</p>
          </>
        )}
      </section>

      <button className="btn btn-block" disabled={posting || pages.length === 0} onClick={openConfirm}>
        {scheduleEnabled ? `ตั้งเวลาโพสต์ (${selected.size} เพจ)` : `โพสต์ทันที (${selected.size} เพจ)`}
      </button>

      <GenerateModal
        open={generateModalOpen}
        prompts={prompts}
        generating={generating}
        onCancel={() => setGenerateModalOpen(false)}
        onGenerate={handleGenerateConfirm}
      />

      <Modal
        open={confirmOpen}
        title={scheduleEnabled ? "ยืนยันการตั้งเวลาโพสต์" : "ยืนยันการโพสต์"}
        subtitle={
          scheduleEnabled
            ? "ตรวจสอบรายละเอียดก่อนตั้งเวลา — Facebook จะเผยแพร่ให้อัตโนมัติตามเวลาที่กำหนด"
            : "ตรวจสอบรายละเอียดก่อนกดยืนยัน — โพสต์จะขึ้นบนเพจจริงทันทีเมื่อกด"
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmPost}
        confirmLabel={scheduleEnabled ? "ยืนยันตั้งเวลา" : "ยืนยัน โพสต์เลย"}
        confirming={posting}
        confirmingLabel="กำลังโพสต์…"
      >
        <div className="modal-warning">
          ⚠️{" "}
          {scheduleEnabled
            ? `จะถูกตั้งเวลาให้ขึ้นจริงในวันที่ ${scheduledLabel}`
            : "การกดยืนยันจะเผยแพร่โพสต์นี้ขึ้นเพจจริงทันที ไม่สามารถเรียกคืนอัตโนมัติได้"}
        </div>

        <div className="modal-summary-row">
          <span>จำนวนเพจ</span>
          <span>{selectedPages.length} เพจ</span>
        </div>
        <div className="modal-summary-row">
          <span>รูปภาพ</span>
          <span>
            {imageFiles.length === 0
              ? "ไม่มี"
              : imageMode === "same"
              ? `${imageFiles.length} รูป (แนบชุดเดียวกันทุกเพจ)`
              : `${imageFiles.length} รูป (สุ่มแจกเพจละ 1 ภาพ)`}
          </span>
        </div>
        {scheduleEnabled && (
          <div className="modal-summary-row">
            <span>เวลาที่ตั้ง</span>
            <span>{scheduledLabel}</span>
          </div>
        )}

        <div className="divider" />
        <div className="preview-toolbar"><label>พรีวิวเพจ</label><select value={previewPageId} onChange={(e) => setPreviewPageId(e.target.value)}>{pairs.map(({ page }) => <option key={page.id} value={page.id}>{page.name}</option>)}</select></div>
        {(() => {
          const pair = pairs.find(({ page }) => page.id === previewPageId) || pairs[0];
          if (!pair) return null;
          const urls = imageMode === "same" ? imageUrls : pair.imageIndex !== null ? [imageUrls[pair.imageIndex]] : [];
          return <FacebookPreview page={pair.page} caption={pair.caption} imageUrls={urls.filter(Boolean)} />;
        })()}
        <p className="preview-note">พรีวิวจำลองการจัดวางใกล้เคียง Facebook; Facebook อาจปรับสัดส่วนเล็กน้อยตามอุปกรณ์และขนาดภาพจริง</p>
      </Modal>

      {results && (
        <section className="card" style={{ marginTop: 20 }}>
          <p className="card-title">
            ผลลัพธ์: สำเร็จ {successCount} / {results.length}
          </p>
          <div className="section-gap" />
          {results.map((r) => (
            <div className="result-item" key={r.pageId}>
              {r.ok ? (
                <span className="ok">✔ {r.pageName} — สำเร็จ</span>
              ) : (
                <span className="err">
                  ✘ {r.pageName} — {r.error}
                </span>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function HistoryTab() {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data) => setHistory(data.history || []))
      .catch(() => setHistory([]));
  }, []);

  if (history === null) return <p className="muted">กำลังโหลด…</p>;
  if (history.length === 0) return <p className="muted">ยังไม่มีประวัติการโพสต์</p>;

  return (
    <section className="card">
      {history.map((h) => {
        const successCount = h.results.filter((r) => r.ok).length;
        return (
          <div className="history-item" key={h.id}>
            <div className="history-meta">
              <span>{new Date(h.createdAt).toLocaleString("th-TH")}</span>
              <span>
                {h.scheduledFor && (
                  <span className="badge" style={{ marginRight: 6 }}>
                    ตั้งเวลา {new Date(h.scheduledFor).toLocaleString("th-TH")}
                  </span>
                )}
                <span className="badge">
                  รูป {h.imageCount} {h.imageMode === "random1" ? "(สุ่มเพจละ 1)" : h.imageMode === "same" ? "(ชุดเดียวกันทุกเพจ)" : ""}
                </span>
              </span>
            </div>
            <p className="muted" style={{ marginBottom: 8 }}>
              สำเร็จ {successCount} / {h.results.length} เพจ
            </p>
            {h.results.map((r) => (
              <div className="history-result" key={r.pageId}>
                {r.ok ? (
                  <span className="ok">✔ {r.pageName}</span>
                ) : (
                  <span className="err">
                    ✘ {r.pageName} — {r.error}
                  </span>
                )}
                {r.imageLabel && (
                  <span className="badge" style={{ marginLeft: 8 }}>
                    🖼️ {r.imageLabel}
                  </span>
                )}
                <div className="history-caption">{r.caption || <em>(ไม่มีข้อความ)</em>}</div>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

function SettingsTab({ prompts, onSaved }: { prompts: PromptPreset[]; onSaved: (p: PromptPreset[]) => void }) {
  const [local, setLocal] = useState<PromptPreset[]>(prompts);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => setLocal(prompts), [prompts]);

  function updateName(idx: number, name: string) {
    setLocal((prev) => prev.map((p, i) => (i === idx ? { ...p, name } : p)));
  }

  function updatePrompt(idx: number, text: string) {
    setLocal((prev) => prev.map((p, i) => (i === idx ? { ...p, prompt: text } : p)));
  }

  function removePreset(idx: number) {
    setLocal((prev) => prev.filter((_, i) => i !== idx));
  }

  function addPreset() {
    setLocal((prev) => [...prev, { id: newId(), name: `Prompt ${prev.length + 1}`, prompt: "" }]);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompts: local }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: data?.error || "บันทึกไม่สำเร็จ" });
      } else {
        setMessage({ type: "ok", text: "บันทึกแล้ว" });
        onSaved(data.prompts || local);
      }
    } catch {
      setMessage({ type: "err", text: "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <div className="row">
        <p className="card-title">⚙️ Prompt สำหรับเจนข้อความ</p>
        <button className="btn btn-secondary" onClick={addPreset}>
          + เพิ่ม Prompt ใหม่
        </button>
      </div>
      <p className="card-subtext" style={{ marginBottom: 14 }}>
        ตั้งได้หลาย Prompt พร้อมตั้งชื่อแยกสไตล์ เช่น "Prompt เชิญชวน", "Prompt แจกของรางวัล" — ตอนกดเจนข้อความ
        จะเลือกได้ว่าจะใช้ Prompt ไหนบ้าง และเจนกี่ชุดต่อ Prompt
      </p>

      {local.length === 0 ? (
        <p className="card-subtext">ยังไม่มี Prompt — กด "+ เพิ่ม Prompt ใหม่" เพื่อเริ่มสร้าง</p>
      ) : (
        local.map((p, idx) => (
          <div className="preset-card" key={p.id}>
            <div className="row" style={{ marginBottom: 0, alignItems: "flex-start" }}>
              <input
                type="text"
                value={p.name}
                onChange={(e) => updateName(idx, e.target.value)}
                placeholder="ชื่อ Prompt เช่น Prompt เชิญชวน"
                style={{ flex: 1 }}
              />
              <button className="btn-icon" onClick={() => removePreset(idx)} title="ลบ Prompt นี้">
                ✕
              </button>
            </div>
            <AutoTextarea
              value={p.prompt}
              onChange={(v) => updatePrompt(idx, v)}
              placeholder="อธิบายโทน สไตล์ เนื้อหา และการจัดรูปแบบที่ต้องการ…"
              minHeight={140}
            />
          </div>
        ))
      )}

      <div className="section-gap" />
      <button className="btn" onClick={handleSave} disabled={saving}>
        {saving ? "กำลังบันทึก…" : "บันทึกทั้งหมด"}
      </button>
      {message && (
        <div className={`banner ${message.type}`} style={{ marginTop: 14, marginBottom: 0 }}>
          {message.text}
        </div>
      )}
    </section>
  );
}

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [form, setForm] = useState({ username: "", displayName: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function load() {
    const response = await fetch("/api/users");
    const data = await response.json();
    if (response.ok) setUsers(data.users || []);
  }
  useEffect(() => { load().catch(() => setMessage({ type: "err", text: "โหลดรายชื่อผู้ใช้ไม่สำเร็จ" })); }, []);

  async function create() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) setMessage({ type: "err", text: data.error || "สร้างบัญชีไม่สำเร็จ" });
      else { setForm({ username: "", displayName: "", password: "" }); setMessage({ type: "ok", text: `สร้างบัญชี @${data.user.username} แล้ว` }); await load(); }
    } finally { setBusy(false); }
  }

  async function patchUser(id: string, changes: Record<string, unknown>) {
    const response = await fetch("/api/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...changes }) });
    const data = await response.json();
    if (!response.ok) setMessage({ type: "err", text: data.error || "แก้ไขบัญชีไม่สำเร็จ" });
    else { setMessage({ type: "ok", text: "อัปเดตบัญชีแล้ว" }); await load(); }
  }

  async function resetPassword(user: ManagedUser) {
    const password = window.prompt(`ตั้งรหัสผ่านใหม่ให้ @${user.username} (อย่างน้อย 8 ตัว)`);
    if (password === null) return;
    await patchUser(user.id, { password });
  }

  return (
    <>
      {message && <div className={`banner ${message.type}`}>{message.text}</div>}
      <section className="card">
        <p className="card-title">👤 สร้างบัญชีผู้ใช้</p>
        <p className="card-subtext">ผู้ใช้จะสมัครเองไม่ได้ แต่ละบัญชีจะเห็นเฉพาะเพจ, token, prompt และประวัติของตัวเอง</p>
        <div className="user-create-grid">
          <input placeholder="Username เช่น somchai" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input placeholder="ชื่อที่แสดง" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          <input type="password" placeholder="รหัสผ่านอย่างน้อย 8 ตัว" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button className="btn" disabled={busy || !form.username || !form.displayName || form.password.length < 8} onClick={create}>{busy ? "กำลังสร้าง…" : "สร้างบัญชี"}</button>
        </div>
      </section>
      <section className="card">
        <p className="card-title">บัญชีทั้งหมด ({users.length})</p><div className="section-gap" />
        <div className="users-list">{users.map((item) => <div className="user-row" key={item.id}>
          <div><strong>{item.displayName}</strong><small>@{item.username} · {item.role === "owner" ? "เจ้าของระบบ" : "ผู้ใช้"}</small></div>
          <span className={`status-pill ${item.active ? "active" : "inactive"}`}>{item.active ? "ใช้งานได้" : "ปิดใช้งาน"}</span>
          <div className="user-actions"><button className="btn btn-secondary" onClick={() => resetPassword(item)}>เปลี่ยนรหัส</button>{item.id !== currentUserId && item.role !== "owner" && <button className={`btn ${item.active ? "btn-danger" : "btn-secondary"}`} onClick={() => patchUser(item.id, { active: !item.active })}>{item.active ? "ปิดบัญชี" : "เปิดบัญชี"}</button>}</div>
        </div>)}</div>
      </section>
    </>
  );
}
