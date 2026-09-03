import type { DirectorScore } from "../schema/director-score.js";
import { PACING_CONFIG } from "./creative-director.js";
import type { ScenePacing } from "../schema/archetype.js";

export interface CritiquePatch {
  score: number;
  strengths: string[];
  weaknesses: string[];
  revision_needed: boolean;
  revision_instructions: string | null;
  weakest_scene_index?: number | null;
  findings?: string[];
}

export interface CriticEvalOptions {
  pacing?: string;
  platform?: string;
  targetDurationMinutes?: number;
  characterLock?: string;
  direction?: string;
  productionNotes?: string[];
}

export interface ScoreAudit {
  wordCount: number;
  sceneCount: number;
  hookWords: number;
  maxConsecutiveSameType: number;
  mode: "short" | "long" | "locked-script";
  findings: string[];
  revisionFocus: string[];
  revisionNeeded: boolean;
  maxScore: number | null;
}

const HUMAN_IN_ANIMAL = /\b(niño|niña|ninos|niños|boy|girl|toddler|human child|hombre|mujer|bebé humano|bebe humano)\b/i;

/** Scan only the scene action, not the lock / MUST-avoid list (those name forbidden humans on purpose). */
export function sceneActionPrompt(prompt: string): string {
  const parts = prompt.split(/\bSCENE:\s*/i);
  if (parts.length > 1) return parts.slice(1).join(" ").trim();
  return prompt
    .replace(/MUST avoid[^.\n]+\.?/gi, "")
    .replace(/MUST keep[^.\n]+\.?/gi, "")
    .replace(/IDENTITY LOCK:[^.]+\.?/gi, "")
    .trim();
}

export function isLockedScript(direction?: string): boolean {
  if (!direction?.trim()) return false;
  return /##\s*Guion/i.test(direction) || direction.trim().length >= 400;
}

export function isLongFormJob(opts: CriticEvalOptions): boolean {
  return (opts.targetDurationMinutes ?? 0) >= 2 || opts.platform === "youtube_horizontal";
}

export function extractLockTokens(characterLock: string): { species: string; appearance: string; tokens: string[] } {
  const species = characterLock.match(/Species\/race[^:]*:\s*([^.\n]+)/i)?.[1]?.trim() ?? "";
  const appearance = characterLock.match(/Appearance[^:]*:\s*([^.\n]+)/i)?.[1]?.trim() ?? "";
  const raw = `${species} ${appearance}`.toLowerCase();
  const tokens = [...new Set(raw.split(/[^a-záéíóúüñ0-9]+/i).filter((w) => w.length >= 4))];
  return { species, appearance, tokens };
}

function consecutiveSameType(score: DirectorScore): number {
  let max = 1;
  let run = 1;
  for (let i = 1; i < score.scenes.length; i++) {
    if (score.scenes[i]?.visual_type === score.scenes[i - 1]?.visual_type) {
      run += 1;
      if (run > max) max = run;
    } else {
      run = 1;
    }
  }
  return score.scenes.length ? max : 0;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function auditDirectorScore(score: DirectorScore, opts: CriticEvalOptions = {}): ScoreAudit {
  const findings: string[] = [];
  const revisionFocus: string[] = [];
  const sceneCount = score.scenes.length;
  const words = score.scenes.reduce((n, s) => n + wordCount(s.script_line), 0);
  const hookWords = wordCount(score.scenes[0]?.script_line ?? "");
  const maxConsecutiveSameType = consecutiveSameType(score);
  const locked = isLockedScript(opts.direction);
  const longForm = isLongFormJob(opts);
  const mode: ScoreAudit["mode"] = locked ? "locked-script" : longForm ? "long" : "short";

  if (maxConsecutiveSameType > 2) {
    findings.push(
      `Regla de variedad: ${maxConsecutiveSameType} escenas seguidas del mismo visual_type (máximo 2).`,
    );
    revisionFocus.push(
      "Alterna visual_type para que no haya más de 2 escenas consecutivas iguales (ai_image / ai_video / text_card / stock).",
    );
  }

  const aiImageCount = score.scenes.filter((s) => s.visual_type === "ai_image").length;
  if (sceneCount >= 6 && aiImageCount / sceneCount >= 0.85) {
    findings.push(
      `Slideshow: ${aiImageCount}/${sceneCount} escenas son ai_image. El video se siente como un carrusel de fotos.`,
    );
    revisionFocus.push("Mete text_card, stock o ai_video entre bloques de fotos para romper el slideshow.");
  }

  const lock = opts.characterLock?.trim();
  if (lock) {
    findings.push(
      "El crítico no ve los fotogramas. Solo comprueba que el prompt lleva el lock; revisa a ojo pelaje, especie y cara en el video.",
    );
    const { species, tokens } = extractLockTokens(lock);
    const animal = /Kind:\s*animal/i.test(lock) || /gato|ocelote|tigrillo|perro|animal/i.test(lock);
    const distinctive = tokens.filter((t) => !["same", "individual", "locked", "appearance", "species"].includes(t));
    for (let i = 0; i < score.scenes.length; i++) {
      const scene = score.scenes[i]!;
      if (scene.visual_type !== "ai_image" && scene.visual_type !== "ai_video") continue;
      const prompt = scene.visual_prompt.toLowerCase();
      const action = sceneActionPrompt(scene.visual_prompt);
      if (animal && HUMAN_IN_ANIMAL.test(action)) {
        findings.push(`Escena ${i}: el prompt mete un humano y el personaje es animal.`);
        revisionFocus.push(`Escena ${i}: quita humanos. El héroe es ${species || "el animal bloqueado"}.`);
      }
      if (distinctive.length && !distinctive.some((t) => prompt.includes(t))) {
        findings.push(
          `Escena ${i}: el prompt no retiene la especie/marcas bloqueadas (${species || distinctive.slice(0, 3).join(", ")}).`,
        );
        revisionFocus.push(
          `Escena ${i}: copia especie y marcas del lock en visual_prompt. No cambies de raza ni de color de pelaje.`,
        );
      }
    }
  }

  if (opts.platform === "youtube_horizontal") {
    const missingWide = score.scenes.filter(
      (s, i) =>
        (s.visual_type === "ai_image" || s.visual_type === "ai_video") &&
        !/16\s*:\s*9|landscape|widescreen|horizontal/i.test(s.visual_prompt) &&
        i >= 0,
    ).length;
    if (missingWide > 0) {
      findings.push(
        `${missingWide} prompts de IA no piden 16:9 horizontal. En Film eso genera cuadrados mezclados con landscape.`,
      );
      revisionFocus.push("Empieza cada visual_prompt de IA con: 16:9 landscape widescreen cinematic frame, full-bleed, sin cintas negras.");
    }

    const aiShots = score.scenes.filter((s) => s.visual_type === "ai_image" || s.visual_type === "ai_video");
    const withShot = aiShots.filter((s) => s.shot_type?.trim());
    if (aiShots.length >= 4 && withShot.length < aiShots.length * 0.5) {
      findings.push(
        `Faltan shot_type en ${aiShots.length - withShot.length} planos de IA. Sin wide/medium/close el personaje sale siempre en el mismo encuadre.`,
      );
      revisionFocus.push(
        "Pon shot_type (wide_establishing, wide, medium, close_up…) y location en cada escena de IA. No repitas el mismo plano en vecinos.",
      );
    }
    const shotKinds = withShot.map((s) => s.shot_type!.trim().toLowerCase());
    if (shotKinds.length >= 4 && new Set(shotKinds).size <= 1) {
      findings.push("Todos los planos de IA usan el mismo shot_type. El Film se siente como un slideshow del mismo encuadre.");
      revisionFocus.push("Alterna wide / medium / close_up / over_shoulder entre escenas vecinas.");
    }
  }

  if (mode === "short") {
    const pacing = (opts.pacing && opts.pacing in PACING_CONFIG ? opts.pacing : undefined) as ScenePacing | undefined;
    const cfg = pacing ? PACING_CONFIG[pacing] : undefined;
    if (cfg) {
      const [minW, maxW] = cfg.totalWords.split("-").map(Number);
      if (maxW && words > maxW + 20) {
        findings.push(`Pacing short: ${words} palabras vs presupuesto ${cfg.totalWords}.`);
        revisionFocus.push(`Recorta el locutor a ${cfg.totalWords} palabras totales.`);
      }
      if (hookWords > 15) {
        findings.push(`Hook short demasiado largo: ${hookWords} palabras (máx. 15).`);
        revisionFocus.push("Reescribe la escena 0 con un gancho de 15 palabras o menos.");
      }
    }
  } else if (mode === "long" && opts.targetDurationMinutes) {
    const target = Math.round(opts.targetDurationMinutes * 150);
    if (words < target * 0.45) {
      findings.push(
        `Guion corto para el target: ~${words} palabras (~${Math.round(words / 2.5)}s) vs ~${target} palabras (${opts.targetDurationMinutes} min).`,
      );
    }
  }

  if (mode === "locked-script") {
    findings.push(
      "El locutor está bloqueado por el guion del productor: no reescribas script_line. Revisa solo planos, identidad y variedad visual.",
    );
  }

  for (const note of opts.productionNotes ?? []) {
    findings.push(note);
    if (/fallback|depleted|429|RESOURCE_EXHAUSTED|falló|failed/i.test(note)) {
      revisionFocus.push(
        "El video IA cayó a imagen fija. Deja ai_video solo donde el proveedor pueda cumplirlo, o avisa en el plan que será foto + Ken Burns.",
      );
    }
  }

  const identityHits = findings.filter((f) => f.includes("especie") || f.includes("humano")).length;
  const varietyHits = findings.filter((f) => f.includes("variedad") || f.includes("Slideshow")).length;
  let maxScore: number | null = null;
  if (identityHits > 0) maxScore = 6;
  if (varietyHits > 0) maxScore = maxScore == null ? 7 : Math.min(maxScore, 7);
  if ((opts.productionNotes ?? []).some((n) => /fallback|429|depleted/i.test(n))) {
    maxScore = maxScore == null ? 7 : Math.min(maxScore, 7);
  }

  const revisionNeeded = revisionFocus.length > 0;
  if (revisionNeeded && maxScore == null) maxScore = 6;

  return {
    wordCount: words,
    sceneCount,
    hookWords,
    maxConsecutiveSameType,
    mode,
    findings: [...new Set(findings)],
    revisionFocus: [...new Set(revisionFocus)],
    revisionNeeded,
    maxScore,
  };
}

export function applyAuditToCritique(critique: CritiquePatch, audit: ScoreAudit): CritiquePatch & { findings: string[] } {
  const weaknesses = [...critique.weaknesses];
  for (const f of audit.findings) {
    if (audit.mode === "locked-script" && /locutor está bloqueado/.test(f)) continue;
    if (!weaknesses.some((w) => w.toLowerCase().includes(f.slice(0, 24).toLowerCase()))) {
      weaknesses.push(f);
    }
  }

  let score = critique.score;
  if (audit.maxScore != null && score > audit.maxScore) score = audit.maxScore;

  const revision_needed = critique.revision_needed || audit.revisionNeeded;
  let revision_instructions = critique.revision_instructions;
  if (audit.revisionFocus.length) {
    const lockNote =
      audit.mode === "locked-script"
        ? "NO reescribas script_line (guion bloqueado). "
        : "";
    const extra = `${lockNote}${audit.revisionFocus.join(" ")}`;
    revision_instructions = revision_instructions ? `${revision_instructions}\n${extra}` : extra;
  }

  return {
    ...critique,
    score,
    weaknesses: weaknesses.slice(0, 6),
    revision_needed,
    revision_instructions,
    findings: audit.findings,
  };
}

export function formatPacingForCritic(
  score: DirectorScore,
  opts: CriticEvalOptions,
  pacingTier: ScenePacing,
  shortRange: string,
): string {
  const audit = auditDirectorScore(score, opts);
  if (audit.mode === "locked-script") {
    return [
      `This video has a LOCKED producer script (${audit.wordCount} words, ${audit.sceneCount} scenes).`,
      "Do NOT score against the short-form 210-265 word budget and do NOT ask to rewrite narration.",
      "Score identity lock, visual variety, 16:9 format (if horizontal), hook clarity, and whether visuals match the locked lines.",
      `Measured: ${audit.wordCount} words, hook ${audit.hookWords} words, max consecutive same visual_type = ${audit.maxConsecutiveSameType}.`,
    ].join(" ");
  }
  if (audit.mode === "long") {
    const minutes = opts.targetDurationMinutes ?? 8;
    const target = Math.round(minutes * 150);
    return [
      `This is a LONG-FORM ${opts.platform === "youtube_horizontal" ? "YouTube horizontal 16:9" : "long-form"} video targeting ~${minutes} minutes (~${target} words).`,
      "Ignore the short-form 210-265 word budget and the 15-word hook cap.",
      `Hook may be 20-40 words. CTA may be 20-40 words. Measured: ${audit.wordCount} words, ${audit.sceneCount} scenes.`,
    ].join(" ");
  }
  return `This video uses **${pacingTier}** pacing (${shortRange}). Evaluate pacing against these tier-specific thresholds, NOT a fixed "5-7 scenes" standard.`;
}

export function summarizeVideoFallbacks(
  resolutions: Array<{ method?: string; error?: string; provider?: string }> | undefined,
): string[] {
  if (!resolutions?.length) return [];
  const notes: string[] = [];
  for (const r of resolutions) {
    if (r.method !== "image_fallback") continue;
    const err = (r.error ?? "").replace(/\s+/g, " ").slice(0, 180);
    if (/429|RESOURCE_EXHAUSTED|depleted|prepayment/i.test(err)) {
      notes.push("Video IA falló: créditos del proveedor de video agotados (429). La escena quedó en foto fija.");
    } else {
      notes.push(`Video IA cayó a imagen fija (${r.provider ?? "unknown"}): ${err || "error sin detalle"}.`);
    }
  }
  return [...new Set(notes)];
}
