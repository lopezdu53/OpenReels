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
  ].join("\n");
}

export function identityLockLead(lock?: string): string {
  const n = countLockedCharacters(lock);
  if (n >= 2) {
    return `IDENTITY LOCK — named CAST of ${n}: each keeps their own species, markings, age and face. Do not merge, swap, or replace anyone.`;
  }
  return `IDENTITY LOCK — same individual every shot, never change species, markings, age or face.`;
}

function prefixIdentity(prompt: string, lock: string): string {
  if (prompt.includes(IDENTITY_MARKER)) return prompt;
  const n = countLockedCharacters(lock);
  const lead = n >= 2 ? `named CAST of ${n}, do not merge or swap.` : "same individual every shot.";
  return `${IDENTITY_MARKER} ${lead} ${lock}. SCENE: ${prompt}`;
}

const STILL = new Set(["ai_image", "stock_image", "text_card"]);
const MOTION = new Set(["ai_video", "stock_video"]);

/** Lock species/identity in prompts and smooth still↔motion cuts so the video does not freeze. */
export function applyVisualIdentity(
  score: DirectorScore,
  characterLock?: string,
): DirectorScore {
  const lock = characterLock?.trim();
  const scenes = score.scenes.map((scene, i) => {
    const next = score.scenes[i + 1];
    let visual_prompt = scene.visual_prompt;
    if (lock && (scene.visual_type === "ai_image" || scene.visual_type === "ai_video")) {
      visual_prompt = prefixIdentity(visual_prompt, lock);
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
