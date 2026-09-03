import { describe, expect, it } from "vitest";
import { buildShotContext } from "./prompt-context.js";

describe("buildShotContext", () => {
  it("emits a stable bible + shot block", () => {
    const text = buildShotContext({
      characterLock: "Name: Coco. Species/race (LOCKED): coatí.",
      artStyle: "Bosque cine 16:9, 35mm",
      shotType: "wide",
      cameraMove: "push_in",
      location: "claro del bosque",
      previousVisualPrompt: "Coco under the kapok tree",
    });
    expect(text).toContain("character_bible: Name: Coco");
    expect(text).toContain("art_style_lock: Bosque cine");
    expect(text).toContain("shot_type: wide");
    expect(text).toContain("camera_move: push_in");
    expect(text).toContain("location: claro del bosque");
    expect(text).toContain("previous_shot");
    expect(text).toContain("kapok");
  });

  it("omits empty fields", () => {
    expect(buildShotContext({})).toBe("");
    expect(buildShotContext({ shotType: "close_up" })).toBe("shot_type: close_up");
  });
});
