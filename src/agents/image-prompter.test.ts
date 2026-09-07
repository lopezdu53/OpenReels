import { describe, expect, it } from "vitest";
import { parseImagePromptResult } from "./image-prompter.js";

describe("parseImagePromptResult", () => {
  it("accepts the documented optimized_prompt field", () => {
    expect(parseImagePromptResult({ optimized_prompt: "  dolly in  " }).optimized_prompt).toBe("dolly in");
  });

  it("accepts camelCase and motion aliases from structured LLM output", () => {
    expect(parseImagePromptResult({ optimizedPrompt: "pan left" }).optimized_prompt).toBe("pan left");
    expect(parseImagePromptResult({ motion_prompt: "tracking shot" }).optimized_prompt).toBe("tracking shot");
    expect(parseImagePromptResult({ videoPrompt: "slow crane up" }).optimized_prompt).toBe("slow crane up");
  });

  it("rejects an empty object so the pipeline can fall back to visual_prompt", () => {
    expect(() => parseImagePromptResult({})).toThrow(/optimized_prompt is required/);
  });
});
