import { describe, expect, it } from "vitest";
import { cookieHeader, readCookie, SESSION_COOKIE } from "./session.js";

describe("session cookies", () => {
  it("round-trips the session id", () => {
    const header = cookieHeader("abc123");
    expect(header).toContain(`${SESSION_COOKIE}=abc123`);
    expect(header).toContain("HttpOnly");
    expect(readCookie(header, SESSION_COOKIE)).toBe("abc123");
  });

  it("clears the cookie", () => {
    const header = cookieHeader("", true);
    expect(header).toContain("Max-Age=0");
  });
});
