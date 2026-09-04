import type { DirectorScore } from "../schema/director-score.js";

export interface CharacterBible {
  name: string;
  kind?: "human" | "animal" | "fictional";
  species: string;
  age?: string;
  sex?: string;
  appearance: string;
  personality?: string;
  wardrobe?: string;
  mustKeep?: string;
  mustAvoid?: string;
  notes?: string;
  /** Nicknames the script may use ("el coatí", "Coco el Coatí"). */
  aliases?: string;
}

const IDENTITY_MARKER = "IDENTITY LOCK:";

export function formatCharacterLock(c: CharacterBible): string {
  const lines = [
    `Name: ${c.name.trim()}`,
    c.aliases?.trim() ? `Aliases (same individual): ${c.aliases.trim()}` : "",
    c.kind ? `Kind: ${c.kind}` : "",
    `Species/race (LOCKED, never substitute a similar animal): ${c.species.trim()}`,
    c.age?.trim() ? `Age: ${c.age.trim()}` : "",
    c.sex?.trim() ? `Sex: ${c.sex.trim()}` : "",
    `Appearance (markings, colors, face — copy exactly): ${c.appearance.trim()}`,
    c.wardrobe?.trim() ? `Wardrobe/accessories: ${c.wardrobe.trim()}` : "",
    c.personality?.trim() ? `Personality visible in pose/expression: ${c.personality.trim()}` : "",
    c.mustKeep?.trim() ? `MUST keep: ${c.mustKeep.trim()}` : "",
    c.mustAvoid?.trim() ? `MUST avoid (do not morph into these): ${c.mustAvoid.trim()}` : "",
    c.notes?.trim() ? `Notes: ${c.notes.trim()}` : "",
  ].filter(Boolean);
  return lines.join(". ");
}

export const MAX_FILM_CHARACTERS = 3;

export function countLockedCharacters(lock?: string): number {
  const text = lock?.trim() ?? "";
  if (!text) return 0;
  const named = text.match(/\bName:\s*/gi);
  if (named?.length) return named.length;
  return 1;
}

export function formatCastLock(cast: CharacterBible[]): string {
  const members = cast.slice(0, MAX_FILM_CHARACTERS);
  if (members.length === 0) return "";
  if (members.length === 1) return formatCharacterLock(members[0]!);
  const numbered = members.map((c, i) => `[${i + 1}] ${formatCharacterLock(c)}`);
  return `CAST of ${members.length} named individuals (do not merge or swap identities). ${numbered.join(" | ")}`;
}

export function characterDirectionBlock(c: CharacterBible): string {
  return characterDirectionBlockForCast([c]);
}

export function characterDirectionBlockForCast(cast: CharacterBible[]): string {
  const members = cast.slice(0, MAX_FILM_CHARACTERS);
  if (members.length === 0) return "";
  if (members.length === 1) {
    return [
      "## Personaje (identidad bloqueada)",
      formatCharacterLock(members[0]!),
      "El mismo individuo en TODAS las escenas. No cambies especie, raza, edad, marcas ni cara. El contraste va por encuadre, luz y emoción, nunca por otro animal.",
    ].join("\n");
  }
  return [
    `## Personajes (identidad bloqueada, ${members.length})`,
    ...members.map((c, i) => `[${i + 1}] ${formatCharacterLock(c)}`),
    "Cada nombre es un individuo distinto. No los fusiones, no intercambies especie/marcas, no sustituyas a nadie por un extra.",
    "ON SCREEN: solo quien nombra esa frase de locución. Si la línea es de un personaje, los demás NO aparecen ni de fondo. Juntos solo cuando la frase nombra a más de uno.",
  ].join("\n");
}

export interface CastMemberLock {
  name: string;
  aliases: string[];
  lock: string;
}

export interface SceneCastFocus {
  lock: string;
  names: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitCastChunks(lock: string): string[] {
  const body = lock.replace(/^CAST of \d+[^.]*\.\s*/i, "").trim();
  if (/\[\d+\]/.test(body) || (body.match(/\bName:\s*/gi)?.length ?? 0) >= 2) {
    return body
      .split(/\s\|\s/)
      .map((part) => part.replace(/^\[\d+\]\s*/, "").trim())
      .filter(Boolean);
  }
  return body ? [body] : [];
}

export function parseCastMembers(lock?: string): CastMemberLock[] {
  const text = lock?.trim() ?? "";
  if (!text) return [];
  return splitCastChunks(text)
    .map((chunk) => {
      const name = chunk.match(/\bName:\s*([^.|]+)/i)?.[1]?.trim() ?? "";
      const aliasRaw = chunk.match(/Aliases[^:]*:\s*([^.|]+)/i)?.[1] ?? "";
      const aliases = aliasRaw
        .split(/,| y | and /i)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2);
      return { name, aliases, lock: chunk };
    })
    .filter((m) => m.name.length >= 2);
}

export function mentionsCastMember(text: string, member: CastMemberLock): boolean {
  const hay = text ?? "";
  if (!hay.trim()) return false;
  const labels = [member.name, ...member.aliases].filter((n) => n.trim().length >= 2);
  return labels.some((label) => new RegExp(`\\b${escapeRegExp(label.trim())}\\b`, "i").test(hay));
}

export function focusCastLock(
  fullLock: string,
  onScreen: CastMemberLock[],
  roster: CastMemberLock[] = parseCastMembers(fullLock),
): string {
  if (roster.length <= 1) return fullLock.trim();
  const others = roster.filter((m) => !onScreen.some((s) => s.name.toLowerCase() === m.name.toLowerCase()));
  const off = others.map((m) => m.name);
  if (onScreen.length === 0) {
    const names = roster.map((m) => m.name).join(", ");
    return `ON SCREEN: none of the named CAST (${names}). Location or atmosphere only. Do not depict ${names}.`;
  }
  if (onScreen.length === 1) {
    const m = onScreen[0]!;
    const ban = off.length ? ` Do not depict ${off.join(" or ")} — not even in the background.` : "";
    return `ON SCREEN: only ${m.name} (solo, no companion).${ban} ${m.lock}`;
  }
  const names = onScreen.map((m) => m.name);
  const locks = onScreen.map((m, i) => `[${i + 1}] ${m.lock}`).join(" | ");
  const ban = off.length ? ` Do not add ${off.join(" or ")}.` : "";
  return `ON SCREEN: ${names.join(" and ")} together in this shot.${ban} CAST of ${names.length}. ${locks}`;
}

export function planSceneCastFocus(
  scenes: Array<{ script_line: string }>,
  characterLock?: string,
): SceneCastFocus[] {
  const full = characterLock?.trim() ?? "";
  const roster = parseCastMembers(full);
  if (roster.length <= 1) {
    return scenes.map(() => ({ lock: full, names: roster.map((m) => m.name) }));
  }
  let last: CastMemberLock[] = [];
  return scenes.map((scene) => {
    const mentioned = roster.filter((m) => mentionsCastMember(scene.script_line, m));
    const onScreen = mentioned.length ? mentioned : last;
    if (mentioned.length) last = mentioned;
    return { lock: focusCastLock(full, onScreen, roster), names: onScreen.map((m) => m.name) };
  });
}

export function characterSheetFitsScene(
  rosterCount: number,
  sheetOwner: string | undefined,
  onScreenNames: string[],
): boolean {
  if (rosterCount < 2) return true;
  if (!sheetOwner || onScreenNames.length === 0) return false;
  return onScreenNames.some((n) => n.toLowerCase() === sheetOwner.toLowerCase());
}

export function identityLockLead(lock?: string): string {
  if (/ON SCREEN:\s*none/i.test(lock ?? "")) {
    return `IDENTITY LOCK — no named CAST member in this frame.`;
  }
  if (/ON SCREEN:\s*only/i.test(lock ?? "")) {
    return `IDENTITY LOCK — only the named ON SCREEN person; other CAST members stay off camera.`;
  }
  const n = countLockedCharacters(lock);
  if (n >= 2) {
    return `IDENTITY LOCK — named CAST of ${n} ON SCREEN: each keeps their own species, markings, age and face. Do not merge, swap, or replace anyone.`;
  }
  return `IDENTITY LOCK — same individual every shot, never change species, markings, age or face.`;
}

function stripIdentityPrefix(prompt: string): string {
  const parts = prompt.split(/\bSCENE:\s*/i);
  if (parts.length > 1) return parts.slice(1).join(" ").trim();
  const scene = prompt
    .replace(/^IDENTITY LOCK[:\s—-][^\n]*\n?/i, "")
    .replace(/CAST of \d+[^.]*\.\s*/gi, "")
    .trim();
  if (/^(?:\[\d+\]\s*)?Name:/i.test(scene)) return "";
  return scene;
}

function prefixIdentity(prompt: string, lock: string): string {
  const scene = stripIdentityPrefix(prompt);
  const n = countLockedCharacters(lock);
  const lead = /ON SCREEN:\s*none/i.test(lock)
    ? "no named CAST on screen."
    : /ON SCREEN:\s*only/i.test(lock)
      ? "only the ON SCREEN person; other CAST members absent."
      : n >= 2
        ? `named CAST of ${n} ON SCREEN, do not merge or swap.`
        : "same individual every shot.";
  return scene
    ? `${IDENTITY_MARKER} ${lead} ${lock}. SCENE: ${scene}`
    : `${IDENTITY_MARKER} ${lead} ${lock}.`;
}

const STILL = new Set(["ai_image", "stock_image", "text_card"]);
const MOTION = new Set(["ai_video", "stock_video"]);

/** Lock species/identity in prompts and smooth still↔motion cuts so the video does not freeze. */
export function applyVisualIdentity(
  score: DirectorScore,
  characterLock?: string,
): DirectorScore {
  const lock = characterLock?.trim();
  const focus = lock ? planSceneCastFocus(score.scenes, lock) : [];
  const scenes = score.scenes.map((scene, i) => {
    const next = score.scenes[i + 1];
    let visual_prompt = scene.visual_prompt;
    const sceneLock = focus[i]?.lock || lock;
    if (sceneLock && (scene.visual_type === "ai_image" || scene.visual_type === "ai_video")) {
      visual_prompt = prefixIdentity(visual_prompt, sceneLock);
    }

    let motion = scene.motion;
    if ((scene.visual_type === "ai_image" || scene.visual_type === "stock_image") && motion === "static") {
      motion = "zoom_in";
    }

    let transition = scene.transition;
    const last = i === score.scenes.length - 1;
    if (!last && next) {
      const stillToMotion = STILL.has(scene.visual_type) && MOTION.has(next.visual_type);
      const motionToStill = MOTION.has(scene.visual_type) && STILL.has(next.visual_type);
      if (stillToMotion || motionToStill || transition == null || transition === "none") {
        transition = "crossfade";
      }
    }

    return { ...scene, visual_prompt, motion, transition };
  });

  return { ...score, scenes };
}
