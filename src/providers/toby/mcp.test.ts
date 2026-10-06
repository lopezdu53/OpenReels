import { describe, expect, it } from "vitest";
import { formatTobyToolError } from "./mcp.js";

describe("Toby MCP errors", () => {
  it("unwraps VALIDATION_ERROR from gen_image content", () => {
    const msg = formatTobyToolError("gen_image", [
      {
        type: "text",
        text: JSON.stringify({
          error_code: "VALIDATION_ERROR",
          message: "Model 'nano-pro' is invalid for flow image.",
        }),
      },
    ]);
    expect(msg).toBe("Toby gen_image: Model 'nano-pro' is invalid for flow image.");
  });
});
