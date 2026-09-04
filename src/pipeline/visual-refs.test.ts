import { describe, expect, it } from "vitest";
import { planVisualReferences, sheetToSceneHint } from "./visual-refs.js";

const sheet = Buffer.alloc(128, 7);
const style = Buffer.alloc(128, 9);

describe("planVisualReferences", () => {
  it("prefers the approved character sheet over style and Atelier on Gemini/VIVI", () => {
    const plan = planVisualReferences({
      characterReferenceImage: sheet,
      styleReferenceImage: style,
      atelierMode: true,
      imageProvider: "vivi",
    });
    expect(plan.globalReference).toBe(sheet);
    expect(plan.useAtelier).toBe(false);
    expect(plan.sheetReference).toBe("character");
  });

  it("does not glue a CAST to one character sheet / Atelier still", () => {
    const plan = planVisualReferences({
      characterReferenceImage: sheet,
      atelierMode: true,
      imageProvider: "vivi",
      characterLock:
        "CAST of 2 named individuals (do not merge or swap identities). [1] Name: Tania. Kind: human. Species/race (LOCKED): Rubia. Appearance: rubia. | [2] Name: Casimiro. Kind: human. Species/race (LOCKED): hombre. Appearance: gafas",
    });
    expect(plan.globalReference).toBeUndefined();
    expect(plan.useAtelier).toBe(false);
    expect(plan.sheetReference).toBeNull();
  });

  it("does not img2img a model sheet on RunPod (FLUX copies the collage)", () => {
    const plan = planVisualReferences({
      characterReferenceImage: sheet,
      atelierMode: true,
      imageProvider: "runpod",
    });
    expect(plan.globalReference).toBeUndefined();
    expect(plan.useAtelier).toBe(true);
    expect(plan.sheetReference).toBeNull();
  });

  it("does not glue two locations to one establishing still", () => {
    const plan = planVisualReferences({
      locationReferenceImage: sheet,
      atelierMode: true,
      imageProvider: "vivi",
      locationLock:
        "LOCATIONS of 2 named places (never combine two places in one frame). [1] Name: Villa. Place (LOCKED): casa blanca. | [2] Name: Oficina. Place (LOCKED): cristal",
    });
    expect(plan.globalReference).toBeUndefined();
    expect(plan.useAtelier).toBe(false);
    expect(plan.sheetReference).toBeNull();
  });

  it("uses a single location board when there is no character sheet", () => {
    const plan = planVisualReferences({ locationReferenceImage: sheet, atelierMode: true, imageProvider: "vivi" });
    expect(plan.globalReference).toBe(sheet);
    expect(plan.useAtelier).toBe(false);
    expect(plan.sheetReference).toBe("location");
  });

  it("uses the style board when there is no character or location sheet", () => {
    const plan = planVisualReferences({ styleReferenceImage: style, atelierMode: true });
    expect(plan.globalReference).toBe(style);
    expect(plan.useAtelier).toBe(false);
    expect(plan.sheetReference).toBe("style");
  });

  it("falls back to Atelier when no sheets are attached", () => {
    const plan = planVisualReferences({ atelierMode: true });
    expect(plan.globalReference).toBeUndefined();
    expect(plan.useAtelier).toBe(true);
    expect(plan.sheetReference).toBeNull();
  });

  it("ignores tiny junk buffers", () => {
    const plan = planVisualReferences({
      characterReferenceImage: Buffer.from("x"),
      atelierMode: false,
    });
    expect(plan.useAtelier).toBe(false);
    expect(plan.sheetReference).toBeNull();
  });
});

describe("sheetToSceneHint", () => {
  it("forbids copying the model-sheet collage", () => {
    expect(sheetToSceneHint("character")).toMatch(/MODEL SHEET/i);
    expect(sheetToSceneHint("character")).toMatch(/Do NOT copy the multi-panel/i);
    expect(sheetToSceneHint("style")).toMatch(/STYLE \/ WORLD/i);
    expect(sheetToSceneHint("location")).toMatch(/LOCATION \/ SET/i);
    expect(sheetToSceneHint(null)).toBe("");
  });
});
