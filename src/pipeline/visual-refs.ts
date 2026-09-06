/**
 * waoowaoo-style reference plan:
 * approved character sheet > style board > Atelier (scene 0 locks the rest).
 * Sheets are identity/style anchors — never a collage to copy.
 */

import { countLockedCharacters, countLockedLocations, normalizeCastMode, type CastMode } from "../library/identity.js";

export type SheetReference = "character" | "style" | "location" | null;

export interface VisualRefPlan {
  /** Passed into every scene generate() when set. */
  globalReference?: Buffer;
  /** Scene 0 generates free, then later scenes use the first AI still. */
  useAtelier: boolean;
  sheetReference: SheetReference;
}

/** FLUX / img2img clones the reference composition. A 4-panel sheet becomes 25 sheets. */
const LAYOUT_CLONE_PROVIDERS = new Set(["runpod", "fal", "openai"]);

export function imageProviderClonesLayout(provider?: string): boolean {
  return LAYOUT_CLONE_PROVIDERS.has(provider ?? "");
}

export function planVisualReferences(opts: {
  characterReferenceImage?: Buffer;
  styleReferenceImage?: Buffer;
  locationReferenceImage?: Buffer;
  atelierMode?: boolean;
  imageProvider?: string;
  characterLock?: string;
  locationLock?: string;
  castMode?: CastMode | string;
}): VisualRefPlan {
  const clonesLayout = imageProviderClonesLayout(opts.imageProvider);
  const heroFollowCam = normalizeCastMode(opts.castMode) === "hero";
  const multiCast = countLockedCharacters(opts.characterLock) >= 2;
  const multiLocation = countLockedLocations(opts.locationLock) >= 2;
  if (heroFollowCam) {
    // Sequential previous-frame (orchestrator continuity), not a glued sheet or scene-0 collage.
    return {
      globalReference: undefined,
      useAtelier: false,
      sheetReference: null,
    };
  }
  if (multiCast || multiLocation) {
    // One sheet / scene-0 still would glue the whole CAST or two places into every later frame.
    return {
      globalReference: undefined,
      useAtelier: false,
      sheetReference: null,
    };
  }
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
  if (opts.locationReferenceImage && opts.locationReferenceImage.length > 100) {
    if (clonesLayout) {
      return {
        globalReference: undefined,
        useAtelier: opts.atelierMode !== false,
        sheetReference: null,
      };
    }
    return {
      globalReference: opts.locationReferenceImage,
      useAtelier: false,
      sheetReference: "location",
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
  if (kind === "location") {
    return (
      "REFERENCE IMAGE is a LOCATION / SET bible board for ONE place. Copy architecture, materials, lighting of that place only. " +
      "Do NOT copy the multi-panel layout or labels. Do NOT add a second location. Paint ONE new cinematic scene in that place."
    );
  }
  return "";
}
