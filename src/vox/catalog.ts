/** Isolated Vox Director catalog — copied from vox/references, not OpenReels. */

export const VOX_THEMES = [
  { id: "american-retro", label: "American retro", mood: "nostálgico, punchy" },
  { id: "swiss-modern", label: "Swiss modern", mood: "preciso, limpio" },
  { id: "punk-zine", label: "Punk zine", mood: "urgente, rebelde" },
  { id: "soviet-constructivist", label: "Constructivista", mood: "heroico" },
  { id: "wpa-propaganda", label: "WPA / silkscreen", mood: "cívico" },
  { id: "70s-groovy", label: "70s groovy", mood: "cálido, funky" },
  { id: "chinese-ink", label: "Tinta china", mood: "elegante, histórico" },
  { id: "atomic-age", label: "Atomic age", mood: "optimista" },
  { id: "newsprint-editorial", label: "Newsprint editorial", mood: "editorial, táctil" },
  { id: "gilded-deco", label: "Gilded deco", mood: "lujoso, vintage" },
] as const;

export const VOX_ARCS = [
  { id: "hook_payoff", label: "Hook → payoff", when: "una idea, el más seguro" },
  { id: "timeline", label: "Línea de tiempo", when: "historia / evolución" },
  { id: "how_it_works", label: "Cómo funciona", when: "proceso o sistema" },
  { id: "pas", label: "PAS", when: "anuncio con dolor" },
  { id: "bab", label: "Before / After / Bridge", when: "el después vende" },
  { id: "aida", label: "AIDA", when: "anuncio en frío" },
  { id: "man_in_hole", label: "Man in a hole", when: "transformación" },
  { id: "myth_buster", label: "Myth buster", when: "desmentir una creencia" },
  { id: "listicle", label: "Listicle", when: "N formas de…" },
  { id: "story_spine", label: "Story spine", when: "marca / fundador" },
  { id: "origin", label: "Origin", when: "por qué existimos" },
  { id: "three_act", label: "Tres actos", when: "narrativa 60s" },
] as const;

export const VOX_VOICES = [
  { id: "leo", label: "Leo", gender: "M", lang: "multi", note: "documental (default)" },
  { id: "rex", label: "Rex", gender: "M", lang: "multi", note: "autoritario" },
  { id: "sal", label: "Sal", gender: "M", lang: "multi", note: "cálido" },
  { id: "ara", label: "Ara", gender: "F", lang: "multi", note: "invitante" },
  { id: "eve", label: "Eve", gender: "F", lang: "multi", note: "brillante" },
  { id: "yis75yfp", label: "Manuel", gender: "M", lang: "es", note: "español nativo" },
  { id: "ekhwx401", label: "Javier", gender: "M", lang: "es", note: "español nativo" },
  { id: "f8cf5c2c78d4", label: "Grace", gender: "F", lang: "en", note: "inglés nativo" },
] as const;

export const VOX_ASPECTS = ["16:9", "9:16", "1:1", "3:4"] as const;
export const VOX_DURATIONS = [15, 30, 60] as const;

export const DEFAULT_IMAGE_MODEL = "google/nano-banana-2/text-to-image";
export const DEFAULT_VIDEO_MODEL = "google/gemini-omni-flash/image-to-video";
export const KLING_VIDEO_MODEL = "kwaivgi/kling-video-o3-pro/image-to-video";
export const AROLL_VIDEO_MODEL = "google/gemini-omni-flash/video-edit";
export const AROLL_FALLBACK_MODEL = "bytedance/seedance-2.0/reference-to-video";

export const DEFAULT_BAKEOFF = ["american-retro", "swiss-modern", "punk-zine", "newsprint-editorial"];

export function recommendArc(topic: string): string {
  const t = topic.toLowerCase();
  if (/(histor|evoluci|línea de tiempo|timeline|siglo)/.test(t)) return "timeline";
  if (/(cómo funciona|how it works|proceso|sistema)/.test(t)) return "how_it_works";
  if (/(compra|oferta|anuncio|ad|vende|promo)/.test(t)) return "pas";
  if (/(mito|no es verdad|mentira|myth)/.test(t)) return "myth_buster";
  if (/(formas de|tips|ranking|top \d)/.test(t)) return "listicle";
  if (/(antes y después|transform|caída|comeback)/.test(t)) return "man_in_hole";
  return "hook_payoff";
}

export function beatCountForDuration(seconds: number): { beats: number; shotsPerBeat: number } {
  if (seconds <= 20) return { beats: 3, shotsPerBeat: 1 };
  if (seconds <= 40) return { beats: 6, shotsPerBeat: 2 };
  return { beats: 10, shotsPerBeat: 2 };
}

export function isThemeId(id: string): boolean {
  return VOX_THEMES.some((t) => t.id === id);
}
