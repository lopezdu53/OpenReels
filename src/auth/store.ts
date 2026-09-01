import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { hashPassword, verifyPassword } from "./password.js";

export const DATA_DIR = process.env["DATA_DIR"] ?? path.join(process.cwd(), "data");
const USERS_DIR = path.join(DATA_DIR, "users");

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
  checkins: Record<string, number>;
  clonedChannels: StoredCloneChannel[];
  clonedVideos: StoredCloneContent[];
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  dailyGoal: number;
}

function ensureDirs(): void {
  fs.mkdirSync(USERS_DIR, { recursive: true });
}

function userPath(id: string): string {
  return path.join(USERS_DIR, `${id}.json`);
}

function indexPath(): string {
  return path.join(USERS_DIR, "index.json");
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

export function toPublic(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    dailyGoal: user.dailyGoal,
  };
}

export function getUserById(id: string): UserRecord | null {
  try {
    return JSON.parse(fs.readFileSync(userPath(id), "utf-8")) as UserRecord;
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

export async function createUser(opts: {
  email: string;
  name: string;
  password: string;
}): Promise<UserRecord> {
  const email = opts.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email no válido");
  if (opts.password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
  const name = opts.name.trim() || email.split("@")[0] || "creador";
  if (getUserByEmail(email)) throw new Error("Ya existe una cuenta con ese email");
  const user: UserRecord = {
    id: randomBytes(12).toString("hex"),
    email,
    name,
    passwordHash: await hashPassword(opts.password),
    createdAt: new Date().toISOString(),
    dailyGoal: 4,
    checkins: {},
    clonedChannels: [],
    clonedVideos: [],
  };
  saveUser(user);
  const index = readIndex();
  index[email] = user.id;
  writeIndex(index);
  return user;
}

export async function authenticate(email: string, password: string): Promise<UserRecord | null> {
  const user = getUserByEmail(email);
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? user : null;
}

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
