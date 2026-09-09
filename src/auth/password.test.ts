import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("verifies a matching password and rejects a wrong one", async () => {
    const stored = await hashPassword("opensesame");
    expect(stored).toContain(":");
    expect(await verifyPassword("opensesame", stored)).toBe(true);
    expect(await verifyPassword("nope", stored)).toBe(false);
  });
});
