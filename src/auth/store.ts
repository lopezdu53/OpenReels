import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { StoredCharacter, StoredVisualStyle } from "../library/types.js";
import type { SocialAccount, SocialPlatform, SocialPublication } from "../publish/types.js";
import { hashPassword, verifyPassword } from "./password.js";

export type UserRole = "admin" | "user";

export function getDataDir(): string {
  return process.env["DATA_DIR"] ?? path.join(process.cwd(), "data");
}

function usersDir(): string {
  return path.join(getDataDir(), "users");
}

export interface StoredCloneChannel {
  id: string;
  savedAt: string;
  sourceChannel: string;
  polishNotes: string;
  channelName: string;
  tagline: string;
  positioning: string;
  targetAudience: string;
  voiceTone: string;
  contentPillars: { name: string; description: string; exampleTopics: string[] }[];
  firstVideos: { title: string; hook: string; format: "short" | "long" }[];
}

export interface StoredCloneContent {
  id: string;
  savedAt: string;
  sourceTitle: string;
  sourceChannel: string;
  polishNotes: string;
  hook: string;
  script: string;
  visualNotes: string;
  youtube: { title: string; description: string; hashtags: string[] };
  tiktok: { title: string; description: string; hashtags: string[] };
  bilibili: { title: string; description: string; hashtags: string[] };
  facebook: { title: string; description: string; hashtags: string[] };
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  dailyGoal: number;
  role?: UserRole;
  checkins: Record<string, number>;
  clonedChannels: StoredCloneChannel[];
  clonedVideos: StoredCloneContent[];
  characters: StoredCharacter[];
  visualStyles: StoredVisualStyle[];
  social?: Partial<Record<SocialPlatform, SocialAccount>>;
  publications?: SocialPublication[];
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  dailyGoal: number;
  role: UserRole;
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  dailyGoal: number;
  role: UserRole;
  clones: number;
  scripts: number;
  envSuperadmin: boolean;
}

function ensureDirs(): void {
  fs.mkdirSync(usersDir(), { recursive: true });
}

function userPath(id: string): string {
  return path.join(usersDir(), `${id}.json`);
}

function indexPath(): string {
  return path.join(usersDir(), "index.json");
}

function readIndex(): Record<string, string> {
  ensureDirs();
  try {
    return JSON.parse(fs.readFileSync(indexPath(), "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeIndex(index: Record<string, string>): void {
  ensureDirs();
  fs.writeFileSync(indexPath(), JSON.stringify(index, null, 2));
}

export function superadminEmail(): string {
  return (process.env["SUPERADMIN_EMAIL"] ?? "").trim().toLowerCase();
}

export function isAdmin(user: UserRecord): boolean {
  if (user.role === "admin") return true;
  const seeded = superadminEmail();
  return Boolean(seeded && user.email === seeded);
}

export function toPublic(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    dailyGoal: user.dailyGoal,
    role: isAdmin(user) ? "admin" : "user",
  };
}

export function toAdminRow(user: UserRecord): AdminUserRow {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    dailyGoal: user.dailyGoal,
    role: isAdmin(user) ? "admin" : "user",
    clones: user.clonedChannels?.length ?? 0,
    scripts: user.clonedVideos?.length ?? 0,
    envSuperadmin: Boolean(superadminEmail() && user.email === superadminEmail()),
  };
}

/** Fill fields added after the first user JSON files were written. */
export function hydrateUser(raw: UserRecord): UserRecord {
  const dailyGoal =
    typeof raw.dailyGoal === "number" && Number.isFinite(raw.dailyGoal) && raw.dailyGoal > 0
      ? raw.dailyGoal
      : 4;
  return {
    ...raw,
    dailyGoal,
    checkins: raw.checkins && typeof raw.checkins === "object" ? raw.checkins : {},
    clonedChannels: Array.isArray(raw.clonedChannels) ? raw.clonedChannels : [],
    clonedVideos: Array.isArray(raw.clonedVideos) ? raw.clonedVideos : [],
    characters: Array.isArray(raw.characters) ? raw.characters : [],
    visualStyles: Array.isArray(raw.visualStyles) ? raw.visualStyles : [],
    publications: Array.isArray(raw.publications) ? raw.publications : [],
    social: raw.social && typeof raw.social === "object" ? raw.social : {},
  };
}

export function getUserById(id: string): UserRecord | null {
  try {
    const raw = JSON.parse(fs.readFileSync(userPath(id), "utf-8")) as UserRecord;
    if (!raw?.id) return null;
    return hydrateUser(raw);
  } catch {
    return null;
  }
}

export function getUserByEmail(email: string): UserRecord | null {
  const id = readIndex()[email.trim().toLowerCase()];
  return id ? getUserById(id) : null;
}

export function saveUser(user: UserRecord): void {
  ensureDirs();
  fs.writeFileSync(userPath(user.id), JSON.stringify(user, null, 2));
}

export function listUsers(): UserRecord[] {
  const index = readIndex();
  const seen = new Set<string>();
  const out: UserRecord[] = [];
  for (const id of Object.values(index)) {
    if (seen.has(id)) continue;
    seen.add(id);
    const user = getUserById(id);
    if (user) out.push(user);
  }
  out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return out;
}

function assertEmail(email: string): string {
  const next = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) throw new Error("Email no válido");
  return next;
}

function assertPassword(password: string): void {
  if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
}

export async function createUser(opts: {
  email: string;
  name: string;
  password: string;
  role?: UserRole;
}): Promise<UserRecord> {
  const email = assertEmail(opts.email);
  assertPassword(opts.password);
  const name = opts.name.trim() || email.split("@")[0] || "creador";
  if (getUserByEmail(email)) throw new Error("Ya existe una cuenta con ese email");
  const user: UserRecord = {
    id: randomBytes(12).toString("hex"),
    email,
    name,
    passwordHash: await hashPassword(opts.password),
    createdAt: new Date().toISOString(),
    dailyGoal: 4,
    role: opts.role === "admin" ? "admin" : "user",
    checkins: {},
    clonedChannels: [],
    clonedVideos: [],
    characters: [],
    visualStyles: [],
    social: {},
    publications: [],
  };
  saveUser(user);
  const index = readIndex();
  index[email] = user.id;
  writeIndex(index);
  return user;
}

function reindexEmail(user: UserRecord, email: string): void {
  const taken = getUserByEmail(email);
  if (taken && taken.id !== user.id) throw new Error("Ya existe una cuenta con ese email");
  if (email === user.email) return;
  const index = readIndex();
  delete index[user.email];
  index[email] = user.id;
  writeIndex(index);
  user.email = email;
}

export async function updateUser(
  id: string,
  patch: { name?: string; email?: string; dailyGoal?: number; role?: UserRole },
): Promise<UserRecord> {
  const user = getUserById(id);
  if (!user) throw new Error("Usuario no encontrado");
  const seeded = superadminEmail();
  if (patch.name != null) {
    const name = patch.name.trim();
    if (!name) throw new Error("El nombre no puede estar vacío");
    user.name = name;
  }
  if (patch.email != null) {
    const email = assertEmail(patch.email);
    if (seeded && user.email === seeded && email !== seeded) {
      throw new Error("No puedes cambiar el email del superadmin definido en EasyPanel");
    }
    reindexEmail(user, email);
  }
  if (patch.dailyGoal != null) {
    user.dailyGoal = Math.min(10, Math.max(1, Math.round(patch.dailyGoal)));
  }
  if (patch.role != null) {
    if (seeded && user.email === seeded && patch.role !== "admin") {
      throw new Error("El superadmin de EasyPanel no se puede degradar");
    }
    user.role = patch.role;
  }
  saveUser(user);
  return user;
}

export async function setUserPassword(id: string, password: string): Promise<UserRecord> {
  const user = getUserById(id);
  if (!user) throw new Error("Usuario no encontrado");
  assertPassword(password);
  user.passwordHash = await hashPassword(password);
  saveUser(user);
  return user;
}

export async function authenticate(email: string, password: string): Promise<UserRecord | null> {
  const user = getUserByEmail(email);
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? user : null;
}

/** Creates or promotes SUPERADMIN_EMAIL. Password is always taken from SUPERADMIN_PASSWORD. */
export async function ensureSuperadmin(): Promise<UserRecord | null> {
  const email = superadminEmail();
  const password = process.env["SUPERADMIN_PASSWORD"] ?? "";
  if (!email || password.length < 8) return null;
  const existing = getUserByEmail(email);
  if (existing) {
    existing.role = "admin";
    existing.passwordHash = await hashPassword(password);
    saveUser(existing);
    return existing;
  }
  return createUser({
    email,
    name: "Superadmin",
    password,
    role: "admin",
  });
}

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
