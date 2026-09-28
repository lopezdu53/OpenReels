import { describe, expect, it } from "vitest";
import { canAccessPath, visibleNav } from "./nav";

describe("studio nav ACL", () => {
  it("hides studio-only items for a normal user", () => {
    const paths = visibleNav("user").map((item) => item.path);
    expect(paths).toEqual([
      "/dashboard",
      "/analytic",
      "/canal",
      "/learning",
      "/casting",
      "/historia",
      "/lab",
    ]);
    expect(paths).not.toContain("/");
    expect(paths).not.toContain("/film");
    expect(paths).not.toContain("/admin");
    expect(paths).not.toContain("/settings");
  });

  it("shows the full studio menu for admin", () => {
    const paths = visibleNav("admin").map((item) => item.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/film");
    expect(paths).toContain("/admin");
    expect(paths).toContain("/settings");
    expect(paths).toContain("/historia");
  });

  it("blocks studio routes for a creator and allows their workspace", () => {
    expect(canAccessPath("user", "/film")).toBe(false);
    expect(canAccessPath("user", "/stickman")).toBe(false);
    expect(canAccessPath("user", "/settings")).toBe(false);
    expect(canAccessPath("user", "/admin")).toBe(false);
    expect(canAccessPath("user", "/historia")).toBe(true);
    expect(canAccessPath("user", "/historia/abc")).toBe(true);
    expect(canAccessPath("user", "/casting/personajes")).toBe(true);
    expect(canAccessPath("user", "/canal")).toBe(true);
    expect(canAccessPath("user", "/analytic/cronograma")).toBe(true);
    expect(canAccessPath("admin", "/film")).toBe(true);
  });
});
