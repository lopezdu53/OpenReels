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
const LOCATION_MARKER = "LOCATION LOCK:";
const OBJECT_MARKER = "OBJECT LOCK:";

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

/** Scene: only who the VO names. Hero: first CAST member never leaves frame. */
export type CastMode = "scene" | "hero";

export function normalizeCastMode(raw?: string | null): CastMode {
  return raw === "hero" ? "hero" : "scene";
}

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

export function characterDirectionBlockForCast(cast: CharacterBible[], mode: CastMode = "scene"): string {
  const members = cast.slice(0, MAX_FILM_CHARACTERS);
  if (members.length === 0) return "";
  if (normalizeCastMode(mode) === "hero") {
    const hero = members[0]!;
    if (members.length === 1) {
      return [
        "## Personaje (modo héroe — siempre en cámara)",
        formatCharacterLock(hero),
        "Este individuo es el HÉROE: aparece en TODOS los planos. El mundo (lugar, objetos, metáforas) se pega a su cuerpo. Nunca un plano de solo locación o atmósfera. Cierra cada escena con una pose que la siguiente herede.",
      ].join("\n");
    }
    return [
      `## Personajes (modo héroe, ${members.length})`,
      `HÉROE (siempre en cuadro): ${formatCharacterLock(hero)}`,
      ...members.slice(1).map((c, i) => `Invitado [${i + 2}] ${formatCharacterLock(c)}`),
      "El héroe NUNCA sale de cámara. Los demás solo cuando la locución los nombra. Locación y objetos se adjuntan al héroe, no lo sustituyen.",
    ].join("\n");
  }
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
  mode: CastMode = "scene",
): string {
  if (normalizeCastMode(mode) === "hero") {
    const hero = roster[0];
    if (!hero) return fullLock.trim();
    const guests = onScreen.filter((m) => m.name.toLowerCase() !== hero.name.toLowerCase());
    const off = roster
      .filter((m) => m.name.toLowerCase() !== hero.name.toLowerCase())
      .filter((m) => !guests.some((g) => g.name.toLowerCase() === m.name.toLowerCase()))
      .map((m) => m.name);
    const ban = off.length ? ` Do not depict ${off.join(" or ")} — not even in the background.` : "";
    if (guests.length === 0) {
      return `HERO ON CAMERA: always ${hero.name}. Never atmosphere-only; camera follows this person; location and props attach to their body.${ban} ${hero.lock}`;
    }
    const names = [hero.name, ...guests.map((g) => g.name)];
    const locks = [hero, ...guests].map((m, i) => `[${i + 1}] ${m.lock}`).join(" | ");
    return `HERO ON CAMERA: always ${hero.name}, plus ${guests.map((g) => g.name).join(" and ")} this shot.${ban} CAST of ${names.length}. ${locks}`;
  }
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
  mode: CastMode = "scene",
): SceneCastFocus[] {
  const full = characterLock?.trim() ?? "";
  const roster = parseCastMembers(full);
  if (normalizeCastMode(mode) === "hero") {
    const hero = roster[0];
    if (!hero) return scenes.map(() => ({ lock: full, names: [] }));
    return scenes.map((scene) => {
      const mentioned = roster.filter((m) => mentionsCastMember(scene.script_line, m));
      const guests = mentioned.filter((m) => m.name.toLowerCase() !== hero.name.toLowerCase());
      const onScreen = [hero, ...guests];
      return { lock: focusCastLock(full, onScreen, roster, "hero"), names: onScreen.map((m) => m.name) };
    });
  }
  if (roster.length <= 1) {
    return scenes.map(() => ({ lock: full, names: roster.map((m) => m.name) }));
  }
  let last: CastMemberLock[] = [];
  return scenes.map((scene) => {
    const mentioned = roster.filter((m) => mentionsCastMember(scene.script_line, m));
    const onScreen = mentioned.length ? mentioned : last;
    if (mentioned.length) last = mentioned;
    return { lock: focusCastLock(full, onScreen, roster, "scene"), names: onScreen.map((m) => m.name) };
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

export interface LocationBible {
  name: string;
  place: string;
  timeOfDay?: string;
  weather?: string;
  mustKeep?: string;
  mustAvoid?: string;
  notes?: string;
  aliases?: string;
}

export const MAX_FILM_LOCATIONS = 3;

export function formatLocationLock(loc: LocationBible): string {
  const lines = [
    `Name: ${loc.name.trim()}`,
    loc.aliases?.trim() ? `Aliases (same place): ${loc.aliases.trim()}` : "",
    `Place (LOCKED, never collage another location): ${loc.place.trim()}`,
    loc.timeOfDay?.trim() ? `Time of day: ${loc.timeOfDay.trim()}` : "",
    loc.weather?.trim() ? `Weather: ${loc.weather.trim()}` : "",
    loc.mustKeep?.trim() ? `MUST keep: ${loc.mustKeep.trim()}` : "",
    loc.mustAvoid?.trim() ? `MUST avoid (do not morph into these places): ${loc.mustAvoid.trim()}` : "",
    loc.notes?.trim() ? `Notes: ${loc.notes.trim()}` : "",
  ].filter(Boolean);
  return lines.join(". ");
}

export function formatLocationRoster(locations: LocationBible[]): string {
  const members = locations.slice(0, MAX_FILM_LOCATIONS);
  if (members.length === 0) return "";
  if (members.length === 1) return formatLocationLock(members[0]!);
  const numbered = members.map((l, i) => `[${i + 1}] ${formatLocationLock(l)}`);
  return `LOCATIONS of ${members.length} named places (never combine two places in one frame). ${numbered.join(" | ")}`;
}

export function locationDirectionBlockForRoster(locations: LocationBible[]): string {
  const members = locations.slice(0, MAX_FILM_LOCATIONS);
  if (members.length === 0) return "";
  if (members.length === 1) {
    return [
      "## Locación (entorno bloqueado)",
      formatLocationLock(members[0]!),
      "El mismo lugar en TODAS las escenas salvo que la locución se mueva. No lo fusiones con otro edificio ni otro paisaje.",
    ].join("\n");
  }
  return [
    `## Locaciones (una por plano, ${members.length})`,
    ...members.map((l, i) => `[${i + 1}] ${formatLocationLock(l)}`),
    "Cada escena ocurre en UNA sola locación del roster. Nunca combines dos lugares en el mismo plano (ni collage, ni split-screen, ni el otro de fondo).",
    "ON LOCATION: solo el lugar que nombra esa frase o el scene.location. Los demás no aparecen.",
  ].join("\n");
}

export interface LocationMemberLock {
  name: string;
  aliases: string[];
  lock: string;
}

export interface SceneLocationFocus {
  lock: string;
  name: string;
}

function splitLocationChunks(lock: string): string[] {
  const body = lock.replace(/^LOCATIONS of \d+[^.]*\.\s*/i, "").trim();
  if (/\[\d+\]/.test(body) || (body.match(/\bName:\s*/gi)?.length ?? 0) >= 2) {
    return body
      .split(/\s\|\s/)
      .map((part) => part.replace(/^\[\d+\]\s*/, "").trim())
      .filter(Boolean);
  }
  return body ? [body] : [];
}

export function parseLocationMembers(lock?: string): LocationMemberLock[] {
  const text = lock?.trim() ?? "";
  if (!text) return [];
  return splitLocationChunks(text)
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

export function countLockedLocations(lock?: string): number {
  const roster = parseLocationMembers(lock);
  if (roster.length) return roster.length;
  const text = lock?.trim() ?? "";
  if (!text) return 0;
  return 1;
}

function slugKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, "");
}

export function mentionsLocationMember(text: string, member: LocationMemberLock): boolean {
  const hay = text ?? "";
  if (!hay.trim()) return false;
  const labels = [member.name, ...member.aliases].filter((n) => n.trim().length >= 2);
  if (labels.some((label) => new RegExp(`\\b${escapeRegExp(label.trim())}\\b`, "i").test(hay))) {
    return true;
  }
  const haySlug = slugKey(hay);
  return labels.some((label) => {
    const t = slugKey(label);
    return t.length >= 4 && haySlug.includes(t);
  });
}

export function focusLocationLock(
  fullLock: string,
  onLocation: LocationMemberLock,
  roster: LocationMemberLock[] = parseLocationMembers(fullLock),
): string {
  if (roster.length <= 1) return fullLock.trim();
  const others = roster.filter((m) => m.name.toLowerCase() !== onLocation.name.toLowerCase());
  const ban = others.length
    ? ` Do not depict ${others.map((m) => m.name).join(" or ")} — not as a split-screen, window, reflection, or background of a different place.`
    : "";
  return `ON LOCATION: only ${onLocation.name} (one place, never collage).${ban} ${onLocation.lock}`;
}

export function planSceneLocationFocus(
  scenes: Array<{ script_line: string; location?: string }>,
  locationLock?: string,
): SceneLocationFocus[] {
  const full = locationLock?.trim() ?? "";
  const roster = parseLocationMembers(full);
  if (roster.length === 0) {
    return scenes.map(() => ({ lock: "", name: "" }));
  }
  if (roster.length === 1) {
    return scenes.map(() => ({ lock: full, name: roster[0]!.name }));
  }
  let last = roster[0]!;
  return scenes.map((scene) => {
    const locField = scene.location ?? "";
    const hay = `${locField} ${scene.script_line}`;
    const mentioned = roster.filter((m) => mentionsLocationMember(hay, m));
    let chosen = last;
    if (mentioned.length === 1) {
      chosen = mentioned[0]!;
    } else if (mentioned.length > 1) {
      chosen =
        mentioned.find((m) => mentionsLocationMember(locField, m)) ?? mentioned[0]!;
    }
    last = chosen;
    return { lock: focusLocationLock(full, chosen, roster), name: chosen.name };
  });
}

export function locationSheetFitsScene(
  rosterCount: number,
  sheetOwner: string | undefined,
  onLocationName: string,
): boolean {
  if (rosterCount < 2) return true;
  if (!sheetOwner || !onLocationName.trim()) return false;
  return onLocationName.toLowerCase() === sheetOwner.toLowerCase();
}

export interface ObjectBible {
  name: string;
  prompt: string;
  notes?: string;
  aliases?: string;
}

export const MAX_FILM_OBJECTS = 10;

export function formatObjectLock(obj: ObjectBible): string {
  const lines = [
    `Name: ${obj.name.trim()}`,
    obj.aliases?.trim() ? `Aliases (same prop): ${obj.aliases.trim()}` : "",
    `Look (LOCKED): ${obj.prompt.trim()}`,
    obj.notes?.trim() ? `Notes: ${obj.notes.trim()}` : "",
  ].filter(Boolean);
  return lines.join(". ");
}

export function formatObjectRoster(objects: ObjectBible[]): string {
  const members = objects.slice(0, MAX_FILM_OBJECTS);
  if (members.length === 0) return "";
  if (members.length === 1) return formatObjectLock(members[0]!);
  const numbered = members.map((o, i) => `[${i + 1}] ${formatObjectLock(o)}`);
  return `OBJECTS of ${members.length} named props (may appear together when the scene needs them; do not invent extras). ${numbered.join(" | ")}`;
}

export interface ObjectMemberLock {
  name: string;
  aliases: string[];
  lock: string;
}

export interface SceneObjectFocus {
  lock: string;
  names: string[];
}

function splitObjectChunks(lock: string): string[] {
  const body = lock.replace(/^OBJECTS of \d+[^.]*\.\s*/i, "").trim();
  if (/\[\d+\]/.test(body) || (body.match(/\bName:\s*/gi)?.length ?? 0) >= 2) {
    return body
      .split(/\s\|\s/)
      .map((part) => part.replace(/^\[\d+\]\s*/, "").trim())
      .filter(Boolean);
  }
  return body ? [body] : [];
}

export function parseObjectMembers(lock?: string): ObjectMemberLock[] {
  const text = lock?.trim() ?? "";
  if (!text) return [];
  return splitObjectChunks(text)
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

export function mentionsObjectMember(text: string, member: ObjectMemberLock): boolean {
  const hay = text ?? "";
  if (!hay.trim()) return false;
  const labels = [member.name, ...member.aliases].filter((n) => n.trim().length >= 2);
  return labels.some((label) => new RegExp(`\\b${escapeRegExp(label.trim())}\\b`, "i").test(hay));
}

export function focusObjectLock(
  fullLock: string,
  onProps: ObjectMemberLock[],
  roster: ObjectMemberLock[] = parseObjectMembers(fullLock),
): string {
  if (roster.length === 0) return "";
  if (onProps.length === 0) {
    const names = roster.map((m) => m.name).join(", ");
    return `ON PROPS: no named prop required this shot. You MAY show any roster prop if it naturally belongs. Do not invent objects outside: ${names}.`;
  }
  const locks = onProps.map((m, i) => (onProps.length > 1 ? `[${i + 1}] ${m.lock}` : m.lock)).join(" | ");
  const names = onProps.map((m) => m.name);
  return `ON PROPS: include ${names.join(" and ")} (they MAY appear together). Other roster props optional if they belong. ${locks}`;
}

export function planSceneObjectFocus(
  scenes: Array<{ script_line: string }>,
  objectLock?: string,
): SceneObjectFocus[] {
  const full = objectLock?.trim() ?? "";
  const roster = parseObjectMembers(full);
  if (roster.length === 0) return scenes.map(() => ({ lock: "", names: [] }));
  return scenes.map((scene) => {
    const mentioned = roster.filter((m) => mentionsObjectMember(scene.script_line, m));
    return { lock: focusObjectLock(full, mentioned, roster), names: mentioned.map((m) => m.name) };
  });
}

export function identityLockLead(lock?: string): string {
  if (/HERO ON CAMERA:\s*always/i.test(lock ?? "")) {
    return `IDENTITY LOCK — HERO stays in every frame; camera follows them; never atmosphere-only.`;
  }
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

function stripLockPrefixes(prompt: string): string {
  const parts = prompt.split(/\bSCENE:\s*/i);
  if (parts.length > 1) return parts.slice(1).join(" ").trim();
  const scene = prompt
    .replace(/^IDENTITY LOCK[:\s—-][^\n]*\n?/i, "")
    .replace(/^LOCATION LOCK[:\s—-][^\n]*\n?/i, "")
    .replace(/^OBJECT LOCK[:\s—-][^\n]*\n?/i, "")
    .replace(/CAST of \d+[^.]*\.\s*/gi, "")
    .replace(/LOCATIONS of \d+[^.]*\.\s*/gi, "")
    .replace(/OBJECTS of \d+[^.]*\.\s*/gi, "")
    .trim();
  if (/^(?:\[\d+\]\s*)?Name:/i.test(scene)) return "";
  if (/^ON (?:SCREEN|LOCATION|PROPS):/i.test(scene)) return "";
  return scene;
}

function locationLockLead(lock?: string): string {
  if (/ON LOCATION:\s*only/i.test(lock ?? "")) {
    return "only the named ON LOCATION place; other roster places stay out of frame.";
  }
  const n = countLockedLocations(lock);
  if (n >= 2) {
    return `named LOCATION roster of ${n}: use exactly one place per frame, never collage.`;
  }
  return "same named place every shot, never morph into another location.";
}

function prefixLocks(prompt: string, characterLock?: string, locationLock?: string, objectLock?: string): string {
  const scene = stripLockPrefixes(prompt);
  const bits: string[] = [];
  if (characterLock?.trim()) {
    const lock = characterLock.trim();
    const n = countLockedCharacters(lock);
    const lead = /HERO ON CAMERA:\s*always/i.test(lock)
      ? "HERO stays in frame; camera follows them; never atmosphere-only."
      : /ON SCREEN:\s*none/i.test(lock)
        ? "no named CAST on screen."
        : /ON SCREEN:\s*only/i.test(lock)
          ? "only the ON SCREEN person; other CAST members absent."
          : n >= 2
            ? `named CAST of ${n} ON SCREEN, do not merge or swap.`
            : "same individual every shot.";
    bits.push(`${IDENTITY_MARKER} ${lead} ${lock}.`);
  }
  if (locationLock?.trim()) {
    const lock = locationLock.trim();
    bits.push(`${LOCATION_MARKER} ${locationLockLead(lock)} ${lock}.`);
  }
  if (objectLock?.trim()) {
    bits.push(`${OBJECT_MARKER} named props may appear together when they belong. ${objectLock.trim()}`);
  }
  if (!bits.length) return prompt;
  return scene ? `${bits.join(" ")} SCENE: ${scene}` : bits.join(" ");
}

const STILL = new Set(["ai_image", "stock_image", "text_card"]);
const MOTION = new Set(["ai_video", "stock_video"]);

/** Lock species/identity in prompts and smooth still↔motion cuts so the video does not freeze. */
export function applyVisualIdentity(
  score: DirectorScore,
  characterLock?: string,
  locationLock?: string,
  objectLock?: string,
  castMode: CastMode = "scene",
): DirectorScore {
  const lock = characterLock?.trim();
  const locFull = locationLock?.trim();
  const objFull = objectLock?.trim();
  const focus = lock ? planSceneCastFocus(score.scenes, lock, castMode) : [];
  const locFocus = locFull ? planSceneLocationFocus(score.scenes, locFull) : [];
  const objFocus = objFull ? planSceneObjectFocus(score.scenes, objFull) : [];
  const scenes = score.scenes.map((scene, i) => {
    const next = score.scenes[i + 1];
    let visual_prompt = scene.visual_prompt;
    const sceneLock = focus[i]?.lock || lock;
    const sceneLoc = locFocus[i]?.lock || locFull;
    const sceneObj = objFocus[i]?.lock || "";
    if ((sceneLock || sceneLoc || sceneObj) && (scene.visual_type === "ai_image" || scene.visual_type === "ai_video")) {
      visual_prompt = prefixLocks(visual_prompt, sceneLock, sceneLoc, sceneObj);
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

    const location = locFocus[i]?.name?.trim() || scene.location;
    return { ...scene, visual_prompt, motion, transition, ...(location ? { location } : {}) };
  });

  return { ...score, scenes };
}
