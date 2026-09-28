import { describe, expect, it } from "vitest";
import { canAccessPath } from "./access.js";

describe("creator path ACL", () => {
  it("lets superadmin open studio tools", () => {
    expect(canAccessPath("admin", "/")).toBe(true);
    expect(canAccessPath("admin", "/film")).toBe(true);
    expect(canAccessPath("admin", "/admin")).toBe(true);
    expect(canAccessPath("admin", "/settings")).toBe(true);
  });

  it("limits created users to the studio menu", () => {
    expect(canAccessPath("user", "/dashboard")).toBe(true);
    expect(canAccessPath("user", "/analytic")).toBe(true);
    expect(canAccessPath("user", "/learning")).toBe(true);
    expect(canAccessPath("user", "/casting/personajes")).toBe(true);
    expect(canAccessPath("user", "/historia")).toBe(true);
    expect(canAccessPath("user", "/lab")).toBe(true);
    expect(canAccessPath("user", "/canal")).toBe(true);
    expect(canAccessPath("user", "/")).toBe(false);
    expect(canAccessPath("user", "/film")).toBe(false);
    expect(canAccessPath("user", "/gallery")).toBe(false);
    expect(canAccessPath("user", "/settings")).toBe(false);
    expect(canAccessPath("user", "/admin")).toBe(false);
  });
});
