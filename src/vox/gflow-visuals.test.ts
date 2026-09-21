import { describe, expect, it } from "vitest";
import { collageMotionPrompt, collageStillPrompt } from "./gflow-visuals.js";

describe("vox gflow prompts", () => {
  it("builds a collage still prompt from the beat", () => {
    const prompt = collageStillPrompt({
      scene: "paper-collage poster of coffee",
      titleEn: "CAFÉ",
      bg: "warm ochre",
      theme: "american-retro",
      aspect: "16:9",
    });
    expect(prompt).toContain("american-retro");
    expect(prompt).toContain("CAFÉ");
    expect(prompt).toContain("16:9");
  });

  it("builds a motion prompt and keeps freeze text", () => {
    const prompt = collageMotionPrompt(
      {
        id: "a",
        dur: 4,
        title: true,
        shot_size: "WIDE",
        camera_move: "push_in",
        scene: "poster",
        element_motion: "tape curls",
      },
      {
        id: 1,
        title_cn: "",
        title_en: "HOOK",
        bg: "ochre",
        feel: "punchy",
        narration: "hola",
        shots: [],
      },
      "FREEZE the face sticker",
    );
    expect(prompt).toContain("push_in");
    expect(prompt).toContain("tape curls");
    expect(prompt).toContain("FREEZE the face sticker");
  });
});
