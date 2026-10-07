import { describe, expect, it } from "vitest";
import { explainTobyUserError, formatTobyToolError } from "./mcp.js";

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

  it("translates a missing Flow MCP login into Spanish steps", () => {
    const raw =
      "Chưa có phiên đăng nhập MCP. Mở Toby Flow sidebar và kết nối lại tài khoản.";
    expect(explainTobyUserError(raw)).toMatch(/sesión en Chrome/i);
    const msg = formatTobyToolError("gen_image", [{ type: "text", text: raw }]);
    expect(msg).toContain("Toby gen_image:");
    expect(msg).toMatch(/extensión Toby/i);
  });
});
