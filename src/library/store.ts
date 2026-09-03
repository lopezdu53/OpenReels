import { randomBytes } from "node:crypto";
import { getUserById, saveUser, type UserRecord } from "../auth/store.js";
import { normalizeCharacterKind } from "./sheets.js";
import type { StoredCharacter, StoredVisualStyle } from "./types.js";

export type { StoredCharacter, StoredVisualStyle } from "./types.js";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_ITEMS = 80;

function now(): string {
  return new Date().toISOString();
}

function newId(): string {
  return randomBytes(8).toString("hex");
}

function asText(v: unknown, max: number, fallback = ""): string {
  if (typeof v !== "string") return fallback;
  return v.trim().slice(0, max);
}

function parseOptionalImage(body: Record<string, unknown>, existing?: string): string | undefined {
  if (!("referenceImage" in body)) return existing;
  const img = body.referenceImage;
  if (img == null || img === "") return undefined;
  if (typeof img !== "string") throw new Error("referenceImage debe ser base64");
  const raw = img.includes(",") ? img.split(",")[1]! : img;
  if (Buffer.byteLength(raw, "base64") > MAX_IMAGE_BYTES) {
    throw new Error("La imagen supera 4MB");
  }
  return raw;
}

export function parseCharacterInput(body: Record<string, unknown>, existing?: StoredCharacter): StoredCharacter {
  const name = asText(body.name, 80);
  const kind = normalizeCharacterKind(body.kind ?? existing?.kind);
  let species = asText(body.species, 160);
  if (kind === "human" && species.length < 2) species = "humano";
  const appearance = asText(body.appearance, 2000);
  if (name.length < 2) throw new Error("El personaje necesita un nombre");
  if (species.length < 2) throw new Error("Indica especie o raza (ej. tigrillo ocelote, no tigre de Bengala)");
  if (appearance.length < 8) throw new Error("Describe apariencia: marcas, color, cara, edad visual");

  const referenceImage = parseOptionalImage(body, existing?.referenceImage);
  const ts = now();
  return {
    id: existing?.id ?? (asText(body.id, 40) || newId()),
    name,
    kind,
    species,
    age: asText(body.age, 80),
    sex: asText(body.sex, 40),
    appearance,
    personality: asText(body.personality, 800),
    wardrobe: asText(body.wardrobe, 400),
    mustKeep: asText(body.mustKeep, 800),
    mustAvoid: asText(body.mustAvoid, 800),
    notes: asText(body.notes, 1200),
    ...(referenceImage ? { referenceImage } : {}),
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
  };
}

export function parseStyleInput(body: Record<string, unknown>, existing?: StoredVisualStyle): StoredVisualStyle {
  const name = asText(body.name, 80);
  const artStyle = asText(body.artStyle, 2000);
  if (name.length < 2) throw new Error("El estilo necesita un nombre");
  if (artStyle.length < 8) throw new Error("Describe el estilo visual (arte, luz, paleta, lente)");
  const referenceImage = parseOptionalImage(body, existing?.referenceImage);
  const ts = now();
  return {
    id: existing?.id ?? (asText(body.id, 40) || newId()),
    name,
    artStyle,
    lighting: asText(body.lighting, 400),
    palette: asText(body.palette, 400),
    notes: asText(body.notes, 800),
    ...(referenceImage ? { referenceImage } : {}),
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
  };
}

export function parseCharacterBundle(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw == null) throw new Error("JSON de personaje inválido");
  const obj = raw as Record<string, unknown>;
  if (obj.openreels === "character" && obj.character && typeof obj.character === "object") {
    return obj.character as Record<string, unknown>;
  }
  return obj;
}

export function parseStyleBundle(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw == null) throw new Error("JSON de estilo inválido");
  const obj = raw as Record<string, unknown>;
  if (obj.openreels === "visual-style" && obj.style && typeof obj.style === "object") {
    return obj.style as Record<string, unknown>;
  }
  return obj;
}

function requireUser(userId: string): UserRecord {
  const user = getUserById(userId);
  if (!user) throw new Error("Usuario no encontrado");
  return user;
}

export function listCharacters(userId: string): StoredCharacter[] {
  return (requireUser(userId).characters ?? []).map((c) => ({
    ...c,
    kind: normalizeCharacterKind(c.kind),
  }));
}

export function upsertCharacter(userId: string, body: Record<string, unknown>): StoredCharacter {
  const user = requireUser(userId);
  const list = user.characters ?? [];
  const id = typeof body.id === "string" ? body.id : "";
  const existing = id ? list.find((c) => c.id === id) : undefined;
  if (!existing && list.length >= MAX_ITEMS) throw new Error("Límite de 80 personajes");
  const next = parseCharacterInput(body, existing);
  user.characters = existing
    ? list.map((c) => (c.id === existing.id ? next : c))
    : [next, ...list];
  saveUser(user);
  return next;
}

export function deleteCharacter(userId: string, id: string): boolean {
  const user = requireUser(userId);
  const before = user.characters?.length ?? 0;
  user.characters = (user.characters ?? []).filter((c) => c.id !== id);
  if ((user.characters?.length ?? 0) === before) return false;
  saveUser(user);
  return true;
}

export function listVisualStyles(userId: string): StoredVisualStyle[] {
  return requireUser(userId).visualStyles ?? [];
}

export function upsertVisualStyle(userId: string, body: Record<string, unknown>): StoredVisualStyle {
  const user = requireUser(userId);
  const list = user.visualStyles ?? [];
  const id = typeof body.id === "string" ? body.id : "";
  const existing = id ? list.find((s) => s.id === id) : undefined;
  if (!existing && list.length >= MAX_ITEMS) throw new Error("Límite de 80 estilos");
  const next = parseStyleInput(body, existing);
  user.visualStyles = existing
    ? list.map((s) => (s.id === existing.id ? next : s))
    : [next, ...list];
  saveUser(user);
  return next;
}

export function deleteVisualStyle(userId: string, id: string): boolean {
  const user = requireUser(userId);
  const before = user.visualStyles?.length ?? 0;
  user.visualStyles = (user.visualStyles ?? []).filter((s) => s.id !== id);
  if ((user.visualStyles?.length ?? 0) === before) return false;
  saveUser(user);
  return true;
}
