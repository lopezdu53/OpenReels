/**
 * waoowaoo-style reference plan:
 * approved character sheet > style board > Atelier (scene 0 locks the rest).
 * Sheets are identity/style anchors — never a collage to copy.
 */

export type SheetReference = "character" | "style" | null;

export interface VisualRefPlan {
  /** Passed into every scene generate() when set. */
  globalReference?: Buffer;
  /** Scene 0 generates free, then later scenes use the first AI still. */
  useAtelier: boolean;
  sheetReference: SheetReference;
}

/** FLUX / img2img clones the reference composition. A 4-panel sheet becomes 25 sheets. */
const LAYOUT_CLONE_PROVIDERS = new Set(["runpod", "fal", "openai"]);

export function planVisualReferences(opts: {
  characterReferenceImage?: Buffer;
  styleReferenceImage?: Buffer;
  atelierMode?: boolean;
  imageProvider?: string;
}): VisualRefPlan {
  const clonesLayout = LAYOUT_CLONE_PROVIDERS.has(opts.imageProvider ?? "");
  if (opts.characterReferenceImage && opts.characterReferenceImage.length > 100) {
    if (clonesLayout) {
      return {
        globalReference: undefined,
        useAtelier: opts.atelierMode !== false,
        sheetReference: null,
      };
    }
    return {
      globalReference: opts.characterReferenceImage,
      useAtelier: false,
      sheetReference: "character",
    };
  }
  if (opts.styleReferenceImage && opts.styleReferenceImage.length > 100) {
    if (clonesLayout) {
      return {
        globalReference: undefined,
        useAtelier: opts.atelierMode !== false,
        sheetReference: null,
      };
    }
    return {
      globalReference: opts.styleReferenceImage,
      useAtelier: false,
      sheetReference: "style",
    };
  }
  return {
    globalReference: undefined,
    useAtelier: opts.atelierMode !== false,
    sheetReference: null,
  };
}

export function sheetToSceneHint(kind: SheetReference): string {
  if (kind === "character") {
    return (
      "REFERENCE IMAGE is a CHARACTER MODEL SHEET / bible. Copy identity only: species, face, markings, body, wardrobe. " +
      "Do NOT copy the multi-panel layout, labels, gutters, or studio backdrop. Paint ONE new cinematic scene with a new camera and environment."
    );
  }
  if (kind === "style") {
    return (
      "REFERENCE IMAGE is a STYLE / WORLD bible board. Match palette, lighting and art style only. " +
      "Do NOT copy the board layout or panels. Paint ONE new cinematic scene."
    );
  }
  return "";
}
