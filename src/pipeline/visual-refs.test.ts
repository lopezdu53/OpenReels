import { describe, expect, it } from "vitest";
import { planVisualReferences, sheetToSceneHint } from "./visual-refs.js";

const sheet = Buffer.alloc(128, 7);
const style = Buffer.alloc(128, 9);

describe("planVisualReferences", () => {
  it("prefers the approved character sheet over style and Atelier", () => {
    const plan = planVisualReferences({
      characterReferenceImage: sheet,
      styleReferenceImage: style,
      atelierMode: true,
    });
    expect(plan.globalReference).toBe(sheet);
    expect(plan.useAtelier).toBe(false);
    expect(plan.sheetReference).toBe("character");
  });

  it("uses the style board when there is no character sheet", () => {
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
    expect(sheetToSceneHint(null)).toBe("");
  });
});
