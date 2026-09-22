/**
 * Kinetic director kit for Nuevo Film (not Stickman).
 * Look + narrative arc + density recipe, parameterized for real characters.
 */

export const FILM_LOOKS = [
  {
    id: "3d-toon",
    label: "3D toon",
    mood: "animación estilizada",
    archetype: "cinematic_documentary",
    prompt:
      "stylized 3D toon, rounded forms, clean subsurface lighting, expressive but simple faces, saturated but controlled palette, no photoreal skin pores, no stick figures",
  },
  {
    id: "clay",
    label: "Clay",
    mood: "plastilina",
    archetype: "cinematic_documentary",
    prompt:
      "claymation / plasticine characters, visible fingerprints in the clay, stop-motion lighting, physical sets, no CGI smoothness, no stick figures, no photoreal humans",
  },
  {
    id: "anime",
    label: "Anime",
    mood: "cine 2D",
    archetype: "anime_illustration",
    prompt:
      "cinematic anime illustration, clean linework, dramatic lighting, painterly backgrounds, consistent character model sheets, no live-action, no stick figures",
  },
  {
    id: "documentary",
    label: "Documental",
    mood: "cine realista",
    archetype: "cinematic_documentary",
    prompt:
      "filmic documentary realism, natural light, 35mm texture, grounded locations, real wardrobe, no cartoon, no stick figures, no title cards in frame",
  },
  {
    id: "noir",
    label: "Noir",
    mood: "alto contraste",
    archetype: "moody_cinematic",
    prompt:
      "black-and-white film noir, hard rim light, deep shadows, wet streets, grain, period or contemporary wardrobe locked, no color, no stick figures",
  },
  {
    id: "isometric",
    label: "Isométrico",
    mood: "diorama",
    archetype: "infographic",
    prompt:
      "isometric diorama, miniature architecture, toy-like scale, crisp edges, one vanishing-less view, the hero is a designed miniature not a stick figure",
  },
  {
    id: "paper-craft",
    label: "Papel",
    mood: "recortes 3D",
    archetype: "pastoral_watercolor",
    prompt:
      "layered paper-craft / papercraft diorama, cut-paper characters with thickness, studio light, paper grain, no photoreal skin, no stick-figure line art, no collage newsprint",
  },
] as const;

export const FILM_ARCS = [
  {
    id: "joke_punchline",
    label: "Chiste → punchline",
    when: "humor rápido",
    hint: "Abre con un gancho y cierra con el chiste. Para temas cortos, memes o un solo gag.",
  },
  {
    id: "how_it_works",
    label: "Cómo funciona",
    when: "explicar un proceso",
    hint: "Explica un proceso paso a paso: qué es, cómo va y el resultado.",
  },
  {
    id: "vs_debate",
    label: "Cara a cara",
    when: "dos ideas chocan",
    hint: "Dos posturas se contradicen: una dice A, la otra B. El héroe o el elenco las encarna.",
  },
  {
    id: "listicle",
    label: "Lista",
    when: "N puntos",
    hint: "Promete N puntos y los recorre uno a uno (tips, ranking, errores).",
  },
  {
    id: "origin",
    label: "Origen",
    when: "de dónde sale algo",
    hint: "Cuenta de dónde nace algo: el antes, el salto y cómo quedó hoy.",
  },
  {
    id: "warning",
    label: "Advertencia",
    when: "un error común",
    hint: "Señala un error común, por qué duele y cómo no caer.",
  },
] as const;

export const DEFAULT_FILM_LOOK = "3d-toon";
export const DEFAULT_FILM_ARC = "joke_punchline";

export type FilmLookId = (typeof FILM_LOOKS)[number]["id"];
export type FilmArcId = (typeof FILM_ARCS)[number]["id"];

export function isFilmLookId(id: string): id is FilmLookId {
  return FILM_LOOKS.some((look) => look.id === id);
}

export function isFilmArcId(id: string): id is FilmArcId {
  return FILM_ARCS.some((arc) => arc.id === id);
}

export function resolveFilmLook(id?: string): (typeof FILM_LOOKS)[number] | undefined {
  if (!id) return undefined;
  return FILM_LOOKS.find((look) => look.id === id);
}

export function filmLookPrompt(id?: string): string {
  return resolveFilmLook(id)?.prompt ?? "";
}

export function filmLookArchetype(id?: string): string | undefined {
  return resolveFilmLook(id)?.archetype;
}

export function filmArcHint(id?: string): string {
  return FILM_ARCS.find((arc) => arc.id === id)?.hint ?? "";
}

export function recommendFilmArc(topic: string): FilmArcId {
  const t = topic.toLowerCase();
  if (/(vs|versus|debate|contra|pelea|discus)/.test(t)) return "vs_debate";
  if (/(cómo funciona|how it works|proceso|sistema|pasos)/.test(t)) return "how_it_works";
  if (/(formas de|tips|ranking|top \d|lista)/.test(t)) return "listicle";
  if (/(origen|de dónde|historia de|nació)/.test(t)) return "origin";
  if (/(cuidado|error|nunca|no hagas|warning)/.test(t)) return "warning";
  return "joke_punchline";
}

/** Visual-density + continuity recipe. Morph world/props; lock the body. */
export function filmDensityRecipe(hero: boolean): string {
  const chain = hero
    ? "FOLLOW-CAM: one continuous take split into I2V clips (~8s). Last frame of clip N is the first frame of clip N+1. Morph across the join. Never a jump-cut portrait."
    : "Neighboring shots may cut, but the locked LOOK and CAST identity never change.";
  return [
    chain,
    "Perceptible visual change every 2–3 seconds (prop, camera, or environment).",
    "Each clip: 0–3s establish, 3–7s transform a concrete metaphor, 7–end climax into the next pose.",
    "At least four devices per beat: body acting, environment transform, named prop, camera move.",
    "MORPH the world and the prop. Do NOT morph the hero's face, body, wardrobe, or species.",
    "Never stick figures, never paper collage, never on-screen typography.",
    "Beat N inherits a visible pose/object/camera motion from beat N-1.",
  ].join(" ");
}

export function filmDirectorKitSection(opts: {
  lookId?: string;
  narrativeArc?: string;
  castMode?: string;
}): string {
  const look = resolveFilmLook(opts.lookId);
  const arcId = opts.narrativeArc && isFilmArcId(opts.narrativeArc) ? opts.narrativeArc : undefined;
  const arc = FILM_ARCS.find((row) => row.id === arcId);
  if (!look && !arc) return "";
  const hero = opts.castMode === "hero";
  const parts = ["\n## KINETIC DIRECTOR KIT (Nuevo Film — not Stickman, not a Short)"];
  if (look) {
    parts.push(
      `LOOK LOCK (${look.label}): ${look.prompt}`,
      "Every visual_prompt stays in this look. Do not switch photoreal ↔ cartoon unless the look is documentary. Never become a stick-figure short.",
    );
  }
  if (arc) {
    parts.push(
      `NARRATIVE ARC (${arc.label}): ${arc.hint}`,
      "Shape the job through that arc. Motivational = hook → recognition → escalation → reframe → action → payoff. Educational = surprising hook → setup → mechanism → consequence → meaning → takeaway. Commercial = pain → consequence → reveal → mechanism → proof → benefit. Never flatten into a generic OpenReels hook/payoff.",
    );
  }
  parts.push(`VISUAL DENSITY: ${filmDensityRecipe(hero)}`);
  return `${parts.join("\n")}\n`;
}

/** Brief for the Film script LLM (tone + arc; never spoken as style names). */
export function filmScriptKitBrief(lookId?: string, narrativeArc?: string): string {
  const look = resolveFilmLook(lookId);
  const arc = FILM_ARCS.find((row) => row.id === narrativeArc);
  if (!look && !arc) return "";
  const parts: string[] = [];
  if (look) {
    parts.push(
      `Look visual: ${look.label} (${look.mood}). El tono del guion encaja con ese diseño; no describas el estilo en voz alta ni menciones palitos o stickman.`,
    );
  }
  if (arc) {
    parts.push(`Arco narrativo (${arc.label}): ${arc.hint}`);
  }
  return parts.join("\n");
}
