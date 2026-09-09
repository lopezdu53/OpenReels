export type CharacterKind = "human" | "animal" | "fictional";
export type SheetImageProvider = "vivi" | "gemini" | "openai" | "grok" | "runpod" | "fal" | "alicloud";

export const SHEET_IMAGE_PROVIDERS: { key: SheetImageProvider; label: string }[] = [
  { key: "vivi", label: "VIVI" },
  { key: "gemini", label: "Google Gemini" },
  { key: "openai", label: "OpenAI" },
  { key: "grok", label: "Grok Imagine" },
  { key: "runpod", label: "RunPod (público)" },
  { key: "fal", label: "fal.ai" },
  { key: "alicloud", label: "Alibaba Cloud" },
];

export function normalizeCharacterKind(v: unknown): CharacterKind {
  if (v === "human" || v === "animal" || v === "fictional") return v;
  return "fictional";
}

export function normalizeSheetProvider(v: unknown): SheetImageProvider {
  if (
    v === "vivi" ||
    v === "gemini" ||
    v === "openai" ||
    v === "grok" ||
    v === "runpod" ||
    v === "fal" ||
    v === "alicloud"
  ) {
    return v;
  }
  return "vivi";
}

export function buildCharacterSheetPrompt(input: {
  name: string;
  kind: CharacterKind;
  species: string;
  age?: string;
  sex?: string;
  appearance: string;
  personality?: string;
  wardrobe?: string;
  mustKeep?: string;
  mustAvoid?: string;
  notes?: string;
}): string {
  const kindLine =
    input.kind === "human"
      ? "Subject type: HUMAN. Photoreal or cinematic illustration of one specific person. Not an animal."
      : input.kind === "animal"
        ? `Subject type: ANIMAL. Exact species/race LOCKED: ${input.species}. Never substitute a similar species (no ocelot-to-Bengal-tiger, no house-cat swap).`
        : `Subject type: FICTIONAL CHARACTER. Species/race LOCKED: ${input.species}. Keep the invented anatomy consistent in every panel.`;

  return [
    "CHARACTER CONCEPT MODEL SHEET, single wide 16:9 landscape image, professional digital concept art.",
    "Neutral seamless studio background, solid cool grey, even soft lighting, no environment scenery, no extra characters.",
    "ONE individual only. Same face, same body, same markings, same wardrobe in every panel.",
    kindLine,
    `Name: ${input.name}.`,
    `Appearance (copy exactly): ${input.appearance}.`,
    input.age ? `Age: ${input.age}.` : "",
    input.sex ? `Sex: ${input.sex}.` : "",
    input.wardrobe ? `Wardrobe / accessories: ${input.wardrobe}.` : "",
    input.personality ? `Expression / personality: ${input.personality}.` : "",
    input.mustKeep ? `MUST keep: ${input.mustKeep}.` : "",
    input.mustAvoid ? `MUST avoid (do not draw these): ${input.mustAvoid}.` : "",
    input.notes ? `Notes: ${input.notes}.` : "",
    "LAYOUT (fill the full widescreen frame, clean gutters, no collage photos):",
    "1) LEFT: large full-body FRONT view, standing, clear silhouette, feet visible.",
    "2) TOP RIGHT: large head-and-shoulders PORTRAIT, face details, eyes, markings.",
    "3) BOTTOM CENTER: smaller full-body SIDE PROFILE, facing left.",
    "4) BOTTOM RIGHT: smaller full-body BACK VIEW, same pose language.",
    "Optional tiny handwritten labels with arrows: CONCEPT ART, FACE, PROFILE, BACK. No other text, no watermark, no logo.",
    "Clean line, consistent proportions, high detail, concept-art presentation. 16:9 landscape only, not portrait. Fill the frame edge to edge, no black letterbox bars.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildStyleSheetPrompt(input: {
  name: string;
  artStyle: string;
  lighting?: string;
  palette?: string;
  notes?: string;
}): string {
  return [
    "VISUAL STYLE / ENVIRONMENT BIBLE SHEET, single wide 16:9 landscape image, professional art-direction board.",
    "No characters with unique faces unless tiny silhouettes. This is the WORLD and LOOK, not a person.",
    `Style name: ${input.name}.`,
    `Art style LOCKED: ${input.artStyle}.`,
    input.lighting ? `Lighting: ${input.lighting}.` : "",
    input.palette ? `Color palette: ${input.palette}.` : "",
    input.notes ? `Notes: ${input.notes}.` : "",
    "LAYOUT (one cohesive 16:9 board, same style in every panel, grey or matching matte around panels):",
    "1) LEFT: large establishing ENVIRONMENT shot, cinematic wide.",
    "2) TOP RIGHT: lighting / atmosphere study of the same world.",
    "3) BOTTOM CENTER: mid shot of a typical location in this style.",
    "4) BOTTOM RIGHT: texture and material close-ups (surfaces, foliage, fabrics, sky).",
    "Optional tiny labels: ENVIRONMENT, LIGHT, PLACE, TEXTURE. No watermarks.",
    "16:9 landscape only. Fill the frame edge to edge, no black letterbox bars. The four panels must feel like one film, not four different movies.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildLocationSheetPrompt(input: {
  name: string;
  place: string;
  timeOfDay?: string;
  weather?: string;
  mustKeep?: string;
  mustAvoid?: string;
  notes?: string;
}): string {
  return [
    "LOCATION / SET BIBLE SHEET, single wide 16:9 landscape image, professional production-design board.",
    "ONE named place only. Do not collage a second location. No unique faces; tiny distant silhouettes only if needed for scale.",
    `Location name: ${input.name}.`,
    `Place LOCKED (architecture, materials, geography — copy exactly): ${input.place}.`,
    input.timeOfDay ? `Time of day: ${input.timeOfDay}.` : "",
    input.weather ? `Weather / atmosphere: ${input.weather}.` : "",
    input.mustKeep ? `MUST keep: ${input.mustKeep}.` : "",
    input.mustAvoid ? `MUST avoid (do not draw these other places): ${input.mustAvoid}.` : "",
    input.notes ? `Notes: ${input.notes}.` : "",
    "LAYOUT (one cohesive 16:9 board, same place in every panel):",
    "1) LEFT: large ESTABLISHING wide of this exact location.",
    "2) TOP RIGHT: lighting / atmosphere study of the SAME place.",
    "3) BOTTOM CENTER: mid shot of a typical corner, room, or landmark of this place.",
    "4) BOTTOM RIGHT: texture and material close-ups (walls, floor, foliage, sky belonging to this place).",
    "Optional tiny labels: ESTABLISH, LIGHT, DETAIL, TEXTURE. No watermarks, no other locations.",
    "16:9 landscape only. Fill the frame edge to edge, no black letterbox bars.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildObjectSheetPrompt(input: {
  name: string;
  prompt: string;
  notes?: string;
}): string {
  return [
    "OBJECT / PROP CONCEPT SHEET, single wide 16:9 landscape image, professional product/prop design board.",
    "ONE named object only. No unique human faces. No second product.",
    `Object name: ${input.name}.`,
    `Look LOCKED (copy exactly): ${input.prompt}.`,
    input.notes ? `Notes: ${input.notes}.` : "",
    "LAYOUT (one cohesive 16:9 board, same object in every panel, seamless studio or matching matte):",
    "1) LEFT: large hero 3/4 view of the object, clear silhouette, readable materials.",
    "2) TOP RIGHT: front or top view, details and markings.",
    "3) BOTTOM CENTER: side profile.",
    "4) BOTTOM RIGHT: back or material close-up (logo, texture, wear).",
    "Optional tiny labels: HERO, FRONT, SIDE, DETAIL. No watermarks, no extra objects.",
    "16:9 landscape only. Fill the frame edge to edge, no black letterbox bars.",
  ]
    .filter(Boolean)
    .join(" ");
}
