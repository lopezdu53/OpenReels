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
      locationLock: "ON LOCATION: only Villa. Name: Villa. Place: casa blanca.",
      objectLock: "ON PROPS: include Mustang. Name: Mustang. Look (LOCKED): Fastback rojo.",
      previousVisualPrompt: "Coco under the kapok tree",
    });
    expect(text).toContain("character_bible: Name: Coco");
    expect(text).toContain("art_style_lock: Bosque cine");
    expect(text).toContain("shot_type: wide");
    expect(text).toContain("camera_move: push_in");
    expect(text).toContain("location: claro del bosque");
    expect(text).toContain("location_bible: ON LOCATION: only Villa");
    expect(text).toContain("object_bible: ON PROPS: include Mustang");
    expect(text).toContain("previous_shot");
    expect(text).toContain("kapok");
  });

  it("asks hero follow-cam shots to inherit the last pose", () => {
    const text = buildShotContext({
      characterLock: "FOLLOW-CAM HERO ON CAMERA: always Tania. Name: Tania.",
      previousVisualPrompt: "Tania mid-stride holding a lantern, facing right",
    });
    expect(text).toContain("inherit the last pose");
    expect(text).toContain("camera tracks the body");
    expect(text).toContain("lantern");
    expect(text).not.toContain("do not carry off-screen CAST");
  });

  it("omits empty fields", () => {
    expect(buildShotContext({})).toBe("");
    expect(buildShotContext({ shotType: "close_up" })).toBe("shot_type: close_up");
  });
});
