import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";

export type UserRole = "owner" | "user";
export type User = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
  active: boolean;
  createdAt: string;
};

type Session = { tokenHash: string; userId: string; expiresAt: string };

export const SESSION_COOKIE = "fb_tools_session";
const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const SESSION_DAYS = 7;

function readJson<T>(file: string, fallback: T): T {
  try {
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporary, file);
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function publicUser(user: User) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

export function ensureOwner(): User {
  const users = readJson<User[]>(USERS_FILE, []);
  const existingOwner = users.find((user) => user.role === "owner");
  if (existingOwner) return existingOwner;

  const username = normalizeUsername(process.env.OWNER_USERNAME || "");
  const password = process.env.OWNER_PASSWORD || "";
  if (!username || password.length < 8) {
    throw new Error("ยังไม่ได้สร้างเจ้าของระบบ กรุณาตั้ง OWNER_USERNAME และ OWNER_PASSWORD (อย่างน้อย 8 ตัว) ใน .env.local");
  }

  const owner: User = {
    id: crypto.randomUUID(),
    username,
    displayName: process.env.OWNER_DISPLAY_NAME?.trim() || "เจ้าของระบบ",
    role: "owner",
    passwordHash: hashPassword(password),
    active: true,
    createdAt: new Date().toISOString(),
  };
  writeJson(USERS_FILE, [owner]);
  return owner;
}

export function listUsers() {
  ensureOwner();
  return readJson<User[]>(USERS_FILE, []).map(publicUser);
}

export function createUser(input: { username: string; displayName: string; password: string }) {
  ensureOwner();
  const username = normalizeUsername(input.username);
  const displayName = input.displayName.trim();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error("Username ต้องมี 3-40 ตัว และใช้ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง");
  if (!displayName) throw new Error("กรุณาใส่ชื่อที่แสดง");
  if (input.password.length < 8) throw new Error("รหัสผ่านต้องมีอย่างน้อย 8 ตัว");
  const users = readJson<User[]>(USERS_FILE, []);
  if (users.some((user) => user.username === username)) throw new Error("Username นี้มีผู้ใช้แล้ว");
  const user: User = {
    id: crypto.randomUUID(), username, displayName, role: "user",
    passwordHash: hashPassword(input.password), active: true, createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeJson(USERS_FILE, users);
  return publicUser(user);
}

export function updateUser(userId: string, input: { active?: boolean; password?: string; displayName?: string }) {
  const users = readJson<User[]>(USERS_FILE, []);
  const user = users.find((item) => item.id === userId);
  if (!user) throw new Error("ไม่พบบัญชีผู้ใช้");
  if (user.role === "owner" && input.active === false) throw new Error("ไม่สามารถปิดบัญชีเจ้าของระบบได้");
  if (typeof input.active === "boolean") user.active = input.active;
  if (input.displayName !== undefined) {
    const name = input.displayName.trim();
    if (!name) throw new Error("ชื่อที่แสดงห้ามว่าง");
    user.displayName = name;
  }
  if (input.password) {
    if (input.password.length < 8) throw new Error("รหัสผ่านต้องมีอย่างน้อย 8 ตัว");
    user.passwordHash = hashPassword(input.password);
  }
  writeJson(USERS_FILE, users);
  if (input.active === false || input.password) revokeUserSessions(user.id);
  return publicUser(user);
}

export function login(usernameInput: string, password: string) {
  ensureOwner();
  const user = readJson<User[]>(USERS_FILE, []).find((item) => item.username === normalizeUsername(usernameInput));
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) return null;
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const sessions = readJson<Session[]>(SESSIONS_FILE, []).filter((session) => new Date(session.expiresAt).getTime() > now);
  sessions.push({ tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(now + SESSION_DAYS * 86400000).toISOString() });
  writeJson(SESSIONS_FILE, sessions);
  return { token, user: publicUser(user), maxAge: SESSION_DAYS * 86400 };
}

export function getUserBySessionToken(token?: string | null) {
  if (!token) return null;
  try { ensureOwner(); } catch { return null; }
  const now = Date.now();
  const session = readJson<Session[]>(SESSIONS_FILE, []).find(
    (item) => item.tokenHash === hashToken(token) && new Date(item.expiresAt).getTime() > now
  );
  if (!session) return null;
  return readJson<User[]>(USERS_FILE, []).find((user) => user.id === session.userId && user.active) || null;
}

export function getRequestUser(req: NextRequest) {
  return getUserBySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

export function logout(token?: string | null) {
  if (!token) return;
  writeJson(SESSIONS_FILE, readJson<Session[]>(SESSIONS_FILE, []).filter((session) => session.tokenHash !== hashToken(token)));
}

function revokeUserSessions(userId: string) {
  writeJson(SESSIONS_FILE, readJson<Session[]>(SESSIONS_FILE, []).filter((session) => session.userId !== userId));
}
